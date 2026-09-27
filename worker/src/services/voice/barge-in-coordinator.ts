/**
 * 全双工时序与打断协调器 (Barge-in Coordinator)
 * 职责：负责打断计数器 sequenceId 递增与 AbortController 生命周期管理
 */
export class BargeInCoordinator {
  private sequenceId: number = 0;
  private currentController: AbortController | null = null;

  public interrupt(): number {
    this.sequenceId++;
    if (this.currentController) {
      this.currentController.abort();
      this.currentController = null;
    }
    return this.sequenceId;
  }

  public nextTurn(): { sequenceId: number; signal: AbortSignal } {
    this.sequenceId++;
    if (this.currentController) {
      this.currentController.abort();
    }
    this.currentController = new AbortController();
    return {
      sequenceId: this.sequenceId,
      signal: this.currentController.signal,
    };
  }

  public isValid(seq: number): boolean {
    return seq === this.sequenceId;
  }

  public getSequenceId(): number {
    return this.sequenceId;
  }

  public abort(): void {
    this.interrupt();
  }
}
