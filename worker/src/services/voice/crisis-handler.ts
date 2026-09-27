import { sendCrisisWebhook } from '../../lib/webhook-sender';

/**
 * 实时会话危机干预处理器 (CrisisHandler)
 * 职责：双轨危机触发响应、上游响应阻断与客户端安抚通知派发
 */
export class CrisisHandler {
  private isCrisisTriggered: boolean = false;

  constructor(
    private serverWs: WebSocket,
    private upstreamWs: WebSocket,
    private webhookUrl: string | undefined,
    private sessionId: string
  ) {}

  public get isTriggered(): boolean {
    return this.isCrisisTriggered;
  }

  public triggerIntervention(tier: 'L1' | 'L2', summary: string, concerns: string[]): void {
    if (this.isCrisisTriggered) return;
    this.isCrisisTriggered = true;

    this.cancelUpstream();
    this.notifyClient(tier);
    this.dispatchWebhook(summary, concerns);
  }

  private cancelUpstream(): void {
    if (this.upstreamWs.readyState === WebSocket.OPEN) {
      this.upstreamWs.send(JSON.stringify({ type: 'response.cancel' }));
    }
  }

  private notifyClient(tier: 'L1' | 'L2'): void {
    if (this.serverWs.readyState === WebSocket.OPEN) {
      this.serverWs.send(
        JSON.stringify({
          type: 'rethink.crisis_intercepted',
          tier,
          message: '我听到了你现在非常痛苦，请记住生命永远是最宝贵的。我现在立即为你接通紧急守护支持。',
        })
      );
    }
  }

  private dispatchWebhook(summary: string, concerns: string[]): void {
    sendCrisisWebhook(this.webhookUrl, {
      sessionId: this.sessionId,
      crisisLevel: 3,
      crisisSummary: summary,
      occurredAt: new Date().toISOString(),
      boothLocation: '校园心理驿站#01',
      coreConcerns: concerns,
    }).catch(() => {});
  }
}
