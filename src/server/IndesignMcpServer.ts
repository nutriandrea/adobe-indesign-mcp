import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { AppConfig } from '../utils/configLoader.js';
import { logger } from '../utils/logger.js';
import { SessionManager } from '../core/SessionManager.js';
import { ChangeTracker } from '../core/ChangeTracker.js';
import { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import { ComScriptExecutor } from '../bridge/ComScriptExecutor.js';
import { BridgeServer } from '../bridge/BridgeServer.js';
import { ExpressBridgeServer } from '../bridge/ExpressBridgeServer.js';
import { DocumentHandler } from '../handlers/DocumentHandler.js';
import { PageHandler } from '../handlers/PageHandler.js';
import { TextHandler } from '../handlers/TextHandler.js';
import { StyleHandler } from '../handlers/StyleHandler.js';
import { ObjectHandler } from '../handlers/ObjectHandler.js';
import { ExportHandler } from '../handlers/ExportHandler.js';
import { MasterHandler } from '../handlers/MasterHandler.js';
import { TableHandler } from '../handlers/TableHandler.js';
import { ResourcesHandler } from '../handlers/ResourcesHandler.js';
import { BookHandler } from '../handlers/BookHandler.js';
import { InteractiveHandler } from '../handlers/InteractiveHandler.js';
import { XmlHandler } from '../handlers/XmlHandler.js';
import { TocHandler } from '../handlers/TocHandler.js';
import { NoteHandler } from '../handlers/NoteHandler.js';
import { IndexHandler } from '../handlers/IndexHandler.js';
import { GrepHandler } from '../handlers/GrepHandler.js';
import { TextAdvancedHandler } from '../handlers/TextAdvancedHandler.js';
import { XrefHandler } from '../handlers/XrefHandler.js';
import { EffectHandler } from '../handlers/EffectHandler.js';
import { TransformHandler } from '../handlers/TransformHandler.js';
import { TableStyleHandler } from '../handlers/TableStyleHandler.js';
import { SectionHandler } from '../handlers/SectionHandler.js';
import { ColorHandler } from '../handlers/ColorHandler.js';
import { FontHandler } from '../handlers/FontHandler.js';
import { ImageHandler } from '../handlers/ImageHandler.js';
import { LayerHandler } from '../handlers/LayerHandler.js';
import { ShapeHandler } from '../handlers/ShapeHandler.js';
import { UndoHandler } from '../handlers/UndoHandler.js';
import { AnchoredObjectHandler } from '../handlers/AnchoredObjectHandler.js';
import { ListHandler } from '../handlers/ListHandler.js';
import { DataMergeHandler } from '../handlers/DataMergeHandler.js';
import { PreviewHandler } from '../handlers/PreviewHandler.js';
import { ChangesHandler } from '../handlers/ChangesHandler.js';

export class IndesignMcpServer {
  private mcpServer: McpServer;
  private executor: ScriptExecutor;
  private sessionManager: SessionManager;
  private changeTracker: ChangeTracker;
  private bridgeServer: BridgeServer | null = null;
  private expressBridgeServer: ExpressBridgeServer | null = null;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    if (config.comBridge.enabled) {
      if (process.platform !== 'win32') {
        throw new Error(
          'comBridge.enabled requires Windows — the COM automation backend only exists there. ' +
            'Set COM_BRIDGE_ENABLED=false to use the default UXP WebSocket bridge.',
        );
      }
      this.executor = new ComScriptExecutor(config.bridge.timeout, config.comBridge);
    } else {
      this.executor = new ScriptExecutor(config.bridge.timeout);
    }
    this.sessionManager = new SessionManager();
    this.changeTracker = new ChangeTracker();

    this.mcpServer = new McpServer({
      name: config.server.name,
      version: config.server.version,
    });

    // Register all handlers
    const handlers = [
      new DocumentHandler(this.executor, this.sessionManager),
      new PageHandler(this.executor),
      new TextHandler(this.executor),
      new StyleHandler(this.executor),
      new ObjectHandler(this.executor),
      new ExportHandler(this.executor),
      new MasterHandler(this.executor),
      new TableHandler(this.executor),
      new ResourcesHandler(this.executor),
      new BookHandler(this.executor),
      new InteractiveHandler(this.executor),
      new XmlHandler(this.executor),
      new TocHandler(this.executor),
      new NoteHandler(this.executor),
      new IndexHandler(this.executor),
      new GrepHandler(this.executor),
      new TextAdvancedHandler(this.executor),
      new XrefHandler(this.executor),
      new EffectHandler(this.executor),
      new TransformHandler(this.executor),
      new TableStyleHandler(this.executor),
      new SectionHandler(this.executor),
      new ColorHandler(this.executor),
      new FontHandler(this.executor),
      new ImageHandler(this.executor),
      new LayerHandler(this.executor),
      new ShapeHandler(this.executor),
      new UndoHandler(this.executor),
      new AnchoredObjectHandler(this.executor),
      new ListHandler(this.executor),
      new DataMergeHandler(this.executor),
      new PreviewHandler(this.executor),
      new ChangesHandler(this.changeTracker),
    ];

    for (const handler of handlers) {
      handler.register(this.mcpServer);
      logger.debug(`Registered handler: ${handler.name}`);
    }

    // Register session resource
    this.mcpServer.resource(
      'session_status',
      'mcp://session/status',
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(Object.fromEntries(this.sessionManager.getAllSessions())),
            mimeType: 'application/json',
          },
        ],
      }),
    );

    // Register bridge resource
    this.mcpServer.resource(
      'bridge_status',
      'mcp://bridge/status',
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(this.executor.getStatus()),
            mimeType: 'application/json',
          },
        ],
      }),
    );

    // Register tools inventory resource (for agent auto-discovery)
    const toolInventory = handlers.flatMap(h =>
      h.tools.map(t => ({ handler: h.name, name: t.name, description: t.description }))
    );
    this.mcpServer.resource(
      'tools_inventory',
      'mcp://tools/inventory',
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(toolInventory, null, 2),
            mimeType: 'application/json',
          },
        ],
      }),
    );

    // Register document resource (active document state)
    this.mcpServer.resource(
      'document_active',
      'mcp://document/active',
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(this.sessionManager.getOrCreate('default').activeDoc ?? { active: false }),
            mimeType: 'application/json',
          },
        ],
      }),
    );

    logger.info(`MCP server initialized: ${config.server.name} v${config.server.version}`);
  }

  async start(): Promise<void> {
    // Start bridge server if using websocket transport
    if (this.config.server.transport === 'websocket') {
      this.bridgeServer = new BridgeServer(this.config.bridge, this.executor);
      await this.bridgeServer.start();

      // Feed plugin-pushed change events into the tracker for changes_getStatus
      this.bridgeServer.events.on('document_changed', (payload: unknown) => {
        this.changeTracker.record('document_changed', payload);
        logger.debug('Document change event received', { payload });
      });
    }

    if (this.config.httpBridge.enabled) {
      // Token resolution (env included) is handled by loadConfig
      this.expressBridgeServer = new ExpressBridgeServer(
        this.config.httpBridge,
        this.executor,
      );
      await this.expressBridgeServer.start();
    }

    // Connect MCP transport
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);

    logger.info(`MCP server running on ${this.config.server.transport} transport`);

    // Handle shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down...');
    this.executor.cancelAll();
    if (this.bridgeServer) {
      await this.bridgeServer.stop();
    }
    if (this.expressBridgeServer) {
      await this.expressBridgeServer.stop();
    }
    process.exit(0);
  }
}
