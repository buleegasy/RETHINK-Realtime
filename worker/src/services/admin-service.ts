/**
 * AdminService 教师管理后台统一门面 (Facade)
 * 聚合鉴权认证 (AdminAuthService)、宏观指标与报表 (AdminReportingService)、危机响应与审计 (AdminCrisisService)
 */
import { AdminAuthService } from './admin/admin-auth-service';
import { AdminReportingService } from './admin/admin-reporting-service';
import { AdminCrisisService } from './admin/admin-crisis-service';

export { AdminAuthService } from './admin/admin-auth-service';
export { AdminReportingService } from './admin/admin-reporting-service';
export { AdminCrisisService } from './admin/admin-crisis-service';

export class AdminService {
  public static readonly authenticateTeacher = AdminAuthService.authenticateTeacher;
  public static readonly getMacroStats = AdminReportingService.getMacroStats;
  public static readonly getSessions = AdminReportingService.getSessions;
  public static readonly getCrises = AdminCrisisService.getCrises;
  public static readonly unmaskCrisis = AdminCrisisService.unmaskCrisis;
  public static readonly updateDisposition = AdminCrisisService.updateDisposition;
  public static readonly softDelete = AdminCrisisService.softDelete;
  public static readonly restoreSession = AdminCrisisService.restoreSession;
  public static readonly reEvaluateSession = AdminReportingService.reEvaluateSession;
  public static readonly getAuditLogs = AdminCrisisService.getAuditLogs;
  public static readonly testWebhook = AdminCrisisService.testWebhook;
}
