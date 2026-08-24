/**
 * InDesign MCP Bridge — UXP Plugin
 *
 * Connects to the MCP server's WebSocket bridge, receives ExtendScript
 * execution requests, runs them inside InDesign, and returns the results.
 */
/* global document, WebSocket */

(function () {
  'use strict';

  // ── State ──
  let ws = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 20;
  const RECONNECT_DELAY_MS = 3000;

  // ── Change-event polling ──
  let changePollTimer = null;
  let lastDocSignature = null;
  const CHANGE_POLL_MS = 5000;

  // ExtendScript is ES3: no JSON object. Serialize manually.
  const DOC_SIGNATURE_SCRIPT =
    '(function(){function esc(s){return String(s).replace(/\\\\/g,"\\\\\\\\").replace(/"/g,"\\\\"");}' +
    'try{var n=app.documents.length;' +
    'if(!n){return "{\\"docs\\":0}";}' +
    'var d=app.activeDocument;' +
    'return "{\\"docs\\":"+n+",\\"name\\":\\""+esc(d.name)+"\\",\\"modified\\":"+(d.modified?"true":"false")+"}";' +
    '}catch(e){return "{\\"error\\":\\""+esc(String(e))+"\\"}";}})()';

  function sendEvent(name, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'event', name: name, payload: payload }));
      } catch (err) {
        logEntry('error', 'Failed to send event: ' + err.message);
      }
    }
  }

  function startChangePolling() {
    if (changePollTimer) return;
    lastDocSignature = null;
    changePollTimer = setInterval(async function () {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        const raw = await runExtendScript(DOC_SIGNATURE_SCRIPT);
        const sig = raw !== null && raw !== undefined ? String(raw) : 'null';
        if (sig !== lastDocSignature) {
          lastDocSignature = sig;
          let payload = {};
          try {
            payload = JSON.parse(sig);
          } catch (e) {
            /* keep empty payload */
          }
          sendEvent('document_changed', payload);
          logEntry('info', 'Change event sent (' + sig.slice(0, 60) + ')');
        }
      } catch (err) {
        // Polling must never break the bridge — ignore poll errors silently
      }
    }, CHANGE_POLL_MS);
  }

  function stopChangePolling() {
    if (changePollTimer) {
      clearInterval(changePollTimer);
      changePollTimer = null;
    }
    lastDocSignature = null;
  }

  // ── DOM refs (populated after DOM ready) ──
  let indicatorEl = null;
  let statusTextEl = null;
  let logEl = null;
  let serverUrlInput = null;
  let connectBtn = null;

  // ── Logging ──
  function logEntry(cssClass, message) {
    if (!logEl) return;
    const entry = document.createElement('div');
    entry.className = 'entry ' + cssClass;
    const ts = new Date().toLocaleTimeString();
    entry.textContent = '[' + ts + '] ' + message;
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ── Status UI ──
  function setStatus(state, text) {
    if (!indicatorEl || !statusTextEl) return;
    indicatorEl.className = state;
    statusTextEl.textContent = text;
  }

  function setConnected() {
    setStatus('connected', 'Connected');
    if (connectBtn) {
      connectBtn.textContent = 'Disconnect';
      serverUrlInput.disabled = true;
    }
    reconnectAttempts = 0;
  }

  function setDisconnected(reason) {
    setStatus('disconnected', 'Disconnected' + (reason ? ': ' + reason : ''));
    if (connectBtn) {
      connectBtn.textContent = 'Connect';
      serverUrlInput.disabled = false;
    }
  }

  function setConnecting() {
    setStatus('connecting', 'Connecting\u2026');
  }

  // ── ExtendScript execution via UXP InDesign API ──
  /**
   * Run raw ExtendScript code inside InDesign.
   * Uses the UXP InDesign module's evaluateScript when available,
   * otherwise falls back to the legacy app.doScript() API.
   */
  async function runExtendScript(code) {
    try {
      // Try the UXP InDesign module path first
      const indesign = require('indesign');
      if (typeof indesign.evaluateScript === 'function') {
        const result = await indesign.evaluateScript(code);
        return result !== undefined ? result : null;
      }
      // Fallback: use the InDesign Application object's doScript
      const app = indesign.app;
      if (app && typeof app.doScript === 'function') {
        const result = app.doScript(code, 1246973031 /* ScriptLanguage.JAVASCRIPT */);
        return result !== undefined ? result : null;
      }
      throw new Error('No available ExtendScript execution API found');
    } catch (err) {
      throw new Error('Script execution failed: ' + (err.message || String(err)));
    }
  }

  // ── WebSocket message handling ──
  async function handleMessage(event) {
    let parsed;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      logEntry('error', 'Invalid message from server: ' + event.data);
      return;
    }

    // Ignore non-request messages (heartbeat, connected ack, etc.)
    if (!parsed.id || !parsed.code) {
      logEntry('info', 'Received non-exec message: ' + (parsed.type || 'unknown'));
      return;
    }

    const requestId = parsed.id;
    const code = parsed.code;
    const timeout = parsed.timeout || 30000;

    logEntry('request', 'Exec script [' + requestId.slice(0, 8) + '\u2026] (' + code.length + ' chars)');

    // Build timeout promise
    const timeoutPromise = new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error('Script execution timed out after ' + timeout + 'ms'));
      }, timeout);
    });

    try {
      const result = await Promise.race([
        runExtendScript(code),
        timeoutPromise,
      ]);
      logEntry('response', 'Result [' + requestId.slice(0, 8) + '\u2026] OK');

      const response = {
        id: requestId,
        type: 'success',
        result: result !== null && result !== undefined ? String(result) : 'null',
      };
      ws.send(JSON.stringify(response));
    } catch (err) {
      logEntry('error', 'Error [' + requestId.slice(0, 8) + '\u2026] ' + err.message);

      const response = {
        id: requestId,
        type: 'error',
        error: err.message,
      };
      // Only send error if socket is still open
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  }

  // ── WebSocket lifecycle ──
  function connect(url) {
    if (ws) {
      ws.onclose = null; // prevent reconnect trigger
      ws.close();
      ws = null;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    setConnecting();
    logEntry('info', 'Connecting to ' + url);

    ws = new WebSocket(url);

    ws.onopen = function () {
      setConnected();
      logEntry('success', 'Connected to bridge server');
      startChangePolling();
    };

    ws.onmessage = handleMessage;

    ws.onclose = function (event) {
      ws = null;
      stopChangePolling();
      setDisconnected('Connection closed (code ' + event.code + ')');

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        logEntry('info', 'Reconnecting in ' + (RECONNECT_DELAY_MS / 1000) + 's (attempt ' + reconnectAttempts + '/' + MAX_RECONNECT_ATTEMPTS + ')');
        setConnecting();
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          connect(url);
        }, RECONNECT_DELAY_MS);
      } else {
        logEntry('error', 'Max reconnect attempts reached. Click Connect to retry.');
      }
    };

    ws.onerror = function () {
      logEntry('error', 'WebSocket connection error');
    };
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // prevent auto-reconnect
    stopChangePolling();
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    setDisconnected('Disconnected by user');
    logEntry('info', 'Disconnected by user');
  }

  // ── Initialization ──
  function onDOMReady() {
    indicatorEl = document.getElementById('indicator');
    statusTextEl = document.getElementById('statusText');
    logEl = document.getElementById('log');
    serverUrlInput = document.getElementById('serverUrl');
    connectBtn = document.getElementById('connectBtn');

    if (!connectBtn || !serverUrlInput) {
      console.error('MCP Bridge: Required DOM elements not found');
      return;
    }

    connectBtn.addEventListener('click', function () {
      if (ws && ws.readyState === WebSocket.OPEN) {
        disconnect();
      } else {
        const url = serverUrlInput.value.trim() || 'ws://localhost:8120';
        connect(url);
      }
    });
  }

  // UXP panels fire DOMContentLoaded on initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDOMReady);
  } else {
    onDOMReady();
  }
})();
