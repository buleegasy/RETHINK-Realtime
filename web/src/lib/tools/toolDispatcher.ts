import type { IRagProvider } from '../pipelines/rag/types';
import type { CBTStage } from '../../types';

export interface ToolDispatcherOptions {
  ragProvider: IRagProvider;
  onStageChange?: (stage: CBTStage, reason?: string) => void;
  onCrisisEscalate?: (severity: string, triggerText: string) => void;
  onSaveUserInfo?: (userName: string) => void;
}

export class RealtimeToolDispatcher {
  private readonly ragProvider: IRagProvider;
  private readonly onStageChange?: (stage: CBTStage, reason?: string) => void;
  private readonly onCrisisEscalate?: (severity: string, triggerText: string) => void;
  private readonly onSaveUserInfo?: (userName: string) => void;

  constructor(options: ToolDispatcherOptions) {
    this.ragProvider = options.ragProvider;
    this.onStageChange = options.onStageChange;
    this.onCrisisEscalate = options.onCrisisEscalate;
    this.onSaveUserInfo = options.onSaveUserInfo;
  }

  public async handleToolCall(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    console.log(`[ToolDispatcher] 触发工具调用: ${name}`, args);

    switch (name) {
      case 'search_knowledge_base': {
        const query = typeof args.query === 'string' ? args.query : '';
        const chunks = await this.ragProvider.retrieve(query, { topK: 2 });
        return {
          status: 'success',
          reference_knowledge: this.ragProvider.formatContext(chunks),
        };
      }

      case 'report_state': {
        const stage = args.stage as CBTStage;
        const reason = typeof args.reason === 'string' ? args.reason : '';
        if (stage) {
          this.onStageChange?.(stage, reason);
        }
        return { status: 'success', current_stage: stage };
      }

      case 'escalate_crisis': {
        const severity = (args.severity as string) || 'high';
        const triggerText = (args.trigger_text as string) || '';
        this.onCrisisEscalate?.(severity, triggerText);
        return { status: 'acknowledged', action: 'crisis_intervention_triggered' };
      }

      case 'save_user_info': {
        const userName = (args.user_name as string) || '';
        if (userName) {
          this.onSaveUserInfo?.(userName);
        }
        return { status: 'success', saved_name: userName };
      }

      default:
        console.warn(`[ToolDispatcher] 未知工具名称: ${name}`);
        return { status: 'ignored', message: `Tool ${name} not found` };
    }
  }
}
