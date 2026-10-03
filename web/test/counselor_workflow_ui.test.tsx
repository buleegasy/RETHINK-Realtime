import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAdminStore } from '../src/store/adminStore';
import { CrisisAlertBanner } from '../src/components/admin/CrisisAlertBanner';
import { SessionFilterToolbar } from '../src/components/admin/SessionFilterToolbar';
import { SessionCard } from '../src/components/admin/SessionCard';
import { SessionDetailModal } from '../src/components/admin/SessionDetailModal';
import { CrisisCard } from '../src/components/admin/CrisisCard';
import { CrisisUnmaskModal } from '../src/components/admin/CrisisUnmaskModal';
import { AdminApiClient } from '../src/lib/api/adminApiClient';
import type { AdminCrisisItem, AdminSessionItem } from '../src/types';

describe('咨询师工作流与 UI 体验优化专项测试 (Counselor Workflow & UI Enhancements)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAdminStore.getState().logout();
    vi.restoreAllMocks();
  });

  describe('CrisisAlertBanner 顶部紧急危机告警横幅', () => {
    it('当存在未结案待跟进危机时，显示醒目通知条与快速处置入口', () => {
      useAdminStore.setState({
        crises: [
          {
            sessionId: 'sess_alert_001',
            duration: 180,
            crisisLevel: 3,
            crisisSummary: '学生自述情绪崩溃有轻生念头',
            coreConcerns: ['绝望无助'],
            emotionalValence: -0.9,
            dispositionStatus: 'pending_contact',
            dispositionNote: '',
            createdAt: 1000,
            hasEncryptedIdentity: true,
          },
        ],
        dismissedAlertSessionIds: [],
      });

      render(<CrisisAlertBanner />);

      expect(screen.getByText(/【紧急危机通知】监测到极高危预警/i)).toBeInTheDocument();
      expect(screen.getByText('#rt_001')).toBeInTheDocument();
      expect(screen.getByText('立即前往处置')).toBeInTheDocument();

      // 点击前往处置，应导航至危机中心待跟进筛选
      fireEvent.click(screen.getByText('立即前往处置'));
      expect(useAdminStore.getState().activeTab).toBe('crises');
      expect(useAdminStore.getState().crisisFilterStatus).toBe('pending_contact');
    });

    it('点击 X 稍后提醒时，将该危机加入免打扰列表并隐藏横幅', () => {
      useAdminStore.setState({
        crises: [
          {
            sessionId: 'sess_alert_002',
            duration: 120,
            crisisLevel: 3,
            crisisSummary: '危机个案',
            coreConcerns: ['重度焦虑'],
            emotionalValence: -0.8,
            dispositionStatus: 'pending_contact',
            dispositionNote: '',
            createdAt: 1000,
            hasEncryptedIdentity: true,
          },
        ],
        dismissedAlertSessionIds: [],
      });

      const { rerender } = render(<CrisisAlertBanner />);
      expect(screen.getByText('立即前往处置')).toBeInTheDocument();

      const dismissBtn = screen.getByTitle('稍后提醒');
      fireEvent.click(dismissBtn);

      expect(useAdminStore.getState().dismissedAlertSessionIds).toContain('sess_alert_002');
      rerender(<CrisisAlertBanner />);
      expect(screen.queryByText('立即前往处置')).not.toBeInTheDocument();
    });

    it('当无未结案危机时，横幅安静隐匿不占空间', () => {
      useAdminStore.setState({ crises: [], dismissedAlertSessionIds: [] });
      const { container } = render(<CrisisAlertBanner />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('SessionFilterToolbar 议题标签 Chips 与检索排序', () => {
    it('从会话列表中动态提取核心议题标签并支持点击切换过滤', () => {
      const mockSessions: AdminSessionItem[] = [
        {
          id: '1',
          sessionId: 's1',
          duration: 100,
          stage: 'Active_Listening',
          isCrisis: false,
          crisisLevel: 0,
          crisisSummary: '',
          coreConcerns: ['模考重压', '失眠'],
          emotionalValence: -0.2,
          deidentifiedReport: null,
          dispositionStatus: 'closed',
          dispositionNote: '',
          isDeleted: false,
          deletedAt: null,
          deleteReason: null,
          deletedBy: null,
          createdAt: 1000,
          hasEncryptedIdentity: false,
        },
      ];

      const onSelectTag = vi.fn();
      const onSearchChange = vi.fn();
      const onSortChange = vi.fn();

      render(
        <SessionFilterToolbar
          sessions={mockSessions}
          showArchived={false}
          onToggleShowArchived={vi.fn()}
          filterCrisisOnly={false}
          onToggleFilterCrisisOnly={vi.fn()}
          searchQuery=""
          onSearchChange={onSearchChange}
          selectedTag={null}
          onSelectTag={onSelectTag}
          sortBy="time"
          onSortByChange={onSortChange}
          totalFilteredCount={1}
        />,
      );

      expect(screen.getByText('全部议题')).toBeInTheDocument();
      expect(screen.getByText('模考重压')).toBeInTheDocument();
      expect(screen.getByText('失眠')).toBeInTheDocument();

      fireEvent.click(screen.getByText('模考重压'));
      expect(onSelectTag).toHaveBeenCalledWith('模考重压');
    });
  });

  describe('SessionCard 档案卡片渲染', () => {
    it('正确展示来访者编号、时长、议题标签并支持查看简报操作', () => {
      const session: AdminSessionItem = {
        id: 'card_1',
        sessionId: 'sess_card_001',
        duration: 150,
        stage: 'Active_Listening',
        isCrisis: false,
        crisisLevel: 0,
        crisisSummary: '',
        coreConcerns: ['人际交往'],
        emotionalValence: 0.1,
        deidentifiedReport: {
          userDisplayName: '李同学',
        } as any,
        dispositionStatus: 'closed',
        dispositionNote: '',
        isDeleted: false,
        deletedAt: null,
        deleteReason: null,
        deletedBy: null,
        createdAt: 1000,
        hasEncryptedIdentity: false,
      };

      const onView = vi.fn();
      render(
        <SessionCard
          session={session}
          onViewDetail={onView}
          onDelete={vi.fn()}
          onRestore={vi.fn()}
        />,
      );

      expect(screen.getByText('李同学')).toBeInTheDocument();
      expect(screen.getByText('2分30秒')).toBeInTheDocument();
      expect(screen.getByText('人际交往')).toBeInTheDocument();

      fireEvent.click(screen.getByText('查看简报'));
      expect(onView).toHaveBeenCalledWith(session);
    });
  });

  describe('SessionDetailModal 会话简报与危机闭环', () => {
    it('对于危机个案，展示危机状态与处置流转控制，支持快速标记已介入与更新备忘录', async () => {
      const session: AdminSessionItem = {
        id: 'sess_modal_crisis',
        sessionId: 'sess_modal_crisis',
        duration: 200,
        stage: 'Crisis_Escalation',
        isCrisis: true,
        crisisLevel: 3,
        crisisSummary: '有轻生念头需重点关注',
        coreConcerns: ['学业焦虑'],
        emotionalValence: -0.8,
        deidentifiedReport: {
          userDisplayName: '小张同学',
          coreConcerns: ['学业焦虑'],
          emotionalTrajectory: { initial: '绝望', final: '缓和', deltaNotes: '已完成初步安抚' },
          evaluatedBy: 'DeepSeek V4 Flash',
        } as any,
        dispositionStatus: 'pending_contact',
        dispositionNote: '初始无说明',
        isDeleted: false,
        deletedAt: null,
        deleteReason: null,
        deletedBy: null,
        createdAt: 1000,
        hasEncryptedIdentity: true,
      };

      // 预置已解密学生身份
      useAdminStore.setState({
        unmaskedMap: {
          sess_modal_crisis: {
            username: '2024001',
            realName: '张真实',
            gradeClass: '高三 (1) 班',
            emergencyContact: '班主任李老师 (13900000000)',
            boothLocation: '心理驿站 #01',
            crisisNote: '学生自述学业压力过重',
          },
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      render(
        <SessionDetailModal
          session={session}
          onClose={vi.fn()}
          onOpenDelete={vi.fn()}
          onOpenRestore={vi.fn()}
          onOpenUnmask={vi.fn()}
        />,
      );

      // 验证危机卡片与已解密身份展示
      expect(screen.getByText(/极高危危机个案/i)).toBeInTheDocument();
      expect(screen.getByText(/张真实/i)).toBeInTheDocument();
      expect(screen.getByText(/班主任李老师/i)).toBeInTheDocument();

      // 点击“已介入”快捷切换流转
      fireEvent.click(screen.getByText('已介入'));
      expect(globalThis.fetch).toHaveBeenCalled();

      // 输入说明并保存
      const noteInput = screen.getByPlaceholderText('填写线下介入跟进说明...');
      fireEvent.change(noteInput, { target: { value: '已线下约谈并联系家长' } });
      fireEvent.click(screen.getByText('保存说明'));
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });

  describe('CrisisCard 危机中心卡片操作', () => {
    it('支持处置状态待跟进/已介入/已结案的无缝切换', () => {
      const item: AdminCrisisItem = {
        sessionId: 'crisis_card_01',
        duration: 120,
        crisisLevel: 3,
        crisisSummary: '测试危机',
        coreConcerns: ['人际危机'],
        emotionalValence: -0.7,
        dispositionStatus: 'pending_contact',
        dispositionNote: '',
        createdAt: 1000,
        hasEncryptedIdentity: true,
      };

      const onStatusChange = vi.fn();
      render(
        <CrisisCard
          item={item}
          editingNote=""
          onNoteChange={vi.fn()}
          onSaveNote={vi.fn()}
          isSavingNote={false}
          isUpdatingStatus={false}
          onStatusChange={onStatusChange}
          onUnmask={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByText('已介入'));
      expect(onStatusChange).toHaveBeenCalledWith('intervened');

      fireEvent.click(screen.getByText('已结案'));
      expect(onStatusChange).toHaveBeenCalledWith('closed');
    });

    it('输入跟进说明时按下回车键应触发 onSaveNote 快捷保存', () => {
      const item: AdminCrisisItem = {
        sessionId: 'crisis_card_enter',
        duration: 100,
        crisisLevel: 3,
        crisisSummary: '摘要',
        coreConcerns: ['压力'],
        emotionalValence: -0.5,
        dispositionStatus: 'pending_contact',
        dispositionNote: '',
        createdAt: 1000,
        hasEncryptedIdentity: true,
      };

      const onSave = vi.fn();
      render(
        <CrisisCard
          item={item}
          editingNote="已电话联系"
          onNoteChange={vi.fn()}
          onSaveNote={onSave}
          isSavingNote={false}
          isUpdatingStatus={false}
          onStatusChange={vi.fn()}
          onUnmask={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      const input = screen.getByPlaceholderText('处置记录与跟进说明...');
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      expect(onSave).toHaveBeenCalled();
    });
  });

  describe('CrisisUnmaskModal 解密后的全流程闭环体验', () => {
    it('解密后支持查看监护人电话、复制电话、输入处置说明与快捷流转', async () => {
      const crisisItem: AdminCrisisItem = {
        sessionId: 'sess_unmask_full',
        duration: 240,
        crisisLevel: 3,
        crisisSummary: '学生有重度抑郁风险',
        coreConcerns: ['抑郁'],
        emotionalValence: -0.9,
        dispositionStatus: 'pending_contact',
        dispositionNote: '',
        createdAt: 1000,
        hasEncryptedIdentity: true,
      };

      useAdminStore.setState({
        unmaskedMap: {
          sess_unmask_full: {
            username: '2024101',
            realName: '王同学',
            gradeClass: '高二 (2) 班',
            emergencyContact: '监护人王父 (13812345678)',
            boothLocation: '教学楼连廊 #01',
            crisisNote: '自述极度绝望',
          },
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const onClose = vi.fn();
      render(<CrisisUnmaskModal crisis={crisisItem} onClose={onClose} />);

      expect(screen.getByText('王同学')).toBeInTheDocument();
      expect(screen.getByText(/13812345678/)).toBeInTheDocument();

      // 输入跟进说明并回车保存
      const noteInput = screen.getByPlaceholderText(
        '填写与家长或学生沟通的情况 (按回车快速保存)...',
      );
      fireEvent.change(noteInput, { target: { value: '已致电王父，家长正赶往学校' } });
      fireEvent.keyDown(noteInput, { key: 'Enter', code: 'Enter' });

      expect(globalThis.fetch).toHaveBeenCalled();

      // 点击已电话联系 · 标记为已介入
      fireEvent.click(screen.getByText('已电话联系 · 标记为已介入'));
      expect(globalThis.fetch).toHaveBeenCalled();

      // 点击完成并返回
      fireEvent.click(screen.getByText('完成并返回'));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('多层弹窗按键事件隔离测试', () => {
    it('当同时存在外层 SessionDetailModal 与内层 CrisisUnmaskModal 时，按 Escape 优先关闭上层解密弹窗', () => {
      const onCloseSessionModal = vi.fn();
      const onCloseUnmaskModal = vi.fn();

      const session: AdminSessionItem = {
        id: 's_double',
        sessionId: 's_double',
        duration: 100,
        stage: 'Crisis_Escalation',
        isCrisis: true,
        crisisLevel: 3,
        crisisSummary: '高危',
        coreConcerns: ['危机'],
        emotionalValence: -0.8,
        deidentifiedReport: null,
        dispositionStatus: 'pending_contact',
        dispositionNote: '',
        isDeleted: false,
        deletedAt: null,
        deleteReason: null,
        deletedBy: null,
        createdAt: 1000,
        hasEncryptedIdentity: true,
      };

      const crisis: AdminCrisisItem = {
        sessionId: 's_double',
        duration: 100,
        crisisLevel: 3,
        crisisSummary: '高危',
        coreConcerns: ['危机'],
        emotionalValence: -0.8,
        dispositionStatus: 'pending_contact',
        dispositionNote: '',
        createdAt: 1000,
        hasEncryptedIdentity: true,
      };

      // 同时渲染外层与内层弹窗
      render(
        <>
          <SessionDetailModal
            session={session}
            onClose={onCloseSessionModal}
            onOpenDelete={vi.fn()}
            onOpenRestore={vi.fn()}
            onOpenUnmask={vi.fn()}
          />
          <CrisisUnmaskModal crisis={crisis} onClose={onCloseUnmaskModal} />
        </>,
      );

      // 触发 Escape
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

      // 上层解密弹窗应关闭
      expect(onCloseUnmaskModal).toHaveBeenCalled();
      // 外层简报弹窗不应被同时连带关闭
      expect(onCloseSessionModal).not.toHaveBeenCalled();
    });
  });

  describe('AdminApiClient API 规范合规测试 (POST body 保障)', () => {
    it('cleanMockData 严格携带 JSON 请求体与 Content-Type，杜绝空 body 悬挂', async () => {
      let capturedOpts: any = null;
      globalThis.fetch = vi.fn().mockImplementation((_url: string, opts: any) => {
        capturedOpts = opts;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, purged: 0 }),
        });
      });

      await AdminApiClient.cleanMockData();
      expect(capturedOpts).toBeDefined();
      expect(capturedOpts.method).toBe('POST');
      expect(capturedOpts.body).toBe(JSON.stringify({}));
      const contentType =
        typeof capturedOpts.headers?.get === 'function'
          ? capturedOpts.headers.get('Content-Type')
          : capturedOpts.headers?.['Content-Type'];
      expect(contentType).toBe('application/json');
    });
  });
});
