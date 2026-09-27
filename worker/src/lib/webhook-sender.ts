export interface CrisisAlertPayload {
  sessionId: string;
  crisisSummary: string;
  crisisLevel: number;
  occurredAt: string;
  boothLocation?: string;
  coreConcerns: string[];
}

export async function sendCrisisWebhook(
  webhookUrl?: string,
  alert?: CrisisAlertPayload
): Promise<{ success: boolean; error?: string }> {
  if (!webhookUrl || !alert) {
    return { success: false, error: 'Webhook URL or alert payload missing' };
  }

  const title = `⚠️ 校园心理终端 [自杀/自残极高危预警]`;
  const textContent = `${title}\n- 会话编号: ${alert.sessionId}\n- 预警等级: 极高危 (Level ${alert.crisisLevel})\n- 发生时间: ${alert.occurredAt}\n- 终端位置: ${alert.boothLocation || '校园心理驿站#01'}\n- 议题标签: ${alert.coreConcerns.join(', ')}\n- 危机判定: ${alert.crisisSummary}\n\n请心理危机干预组老师即刻登录管理后台，输入二次安全口令解除脱敏并实施线下保护！`;

  let bodyPayload: any;
  if (webhookUrl.includes('feishu.cn') || webhookUrl.includes('larksuite.com')) {
    bodyPayload = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: title },
          template: 'red',
        },
        elements: [
          {
            tag: 'markdown',
            content: `**发生时间**: ${alert.occurredAt}\n**位置**: ${alert.boothLocation || '校园心理驿站#01'}\n**风险判定**: <font color='red'>${alert.crisisSummary}</font>\n**核心议题**: ${alert.coreConcerns.join(', ')}`,
          },
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: { tag: 'plain_text', content: '登入后台介入处理' },
                type: 'danger',
                url: 'https://rethink.campus/admin',
              },
            ],
          },
        ],
      },
    };
  } else if (webhookUrl.includes('dingtalk.com')) {
    bodyPayload = {
      msgtype: 'markdown',
      markdown: {
        title,
        text: `### ${title}\n- **发生时间**: ${alert.occurredAt}\n- **终端位置**: ${alert.boothLocation || '校园心理驿站#01'}\n- **危机判定**: <font color="#d93025">${alert.crisisSummary}</font>\n- **核心议题**: ${alert.coreConcerns.join(', ')}\n\n> 请立即前往教师后台完成二次鉴权与现场排查。`,
      },
    };
  } else if (webhookUrl.includes('weixin.qq.com')) {
    bodyPayload = {
      msgtype: 'text',
      text: {
        content: textContent,
      },
    };
  } else {
    bodyPayload = {
      event: 'STUDENT_CRISIS_ESCALATION',
      alert,
      content: textContent,
    };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });
    return { success: res.ok };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}
