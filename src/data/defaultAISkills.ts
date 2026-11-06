export interface AISkill {
  id: string;
  name: string;
  category: string;
  description: string;
  skillMarkdown: string;
  isBuiltIn?: boolean;
}

export const STORAGE_AI_SKILLS_KEY = 'craftcv_ai_skills_v1';
export const STORAGE_SELECTED_SKILLS_KEY = 'craftcv_selected_skill_ids_v1';
export const STORAGE_AUTO_SKILL_MODE_KEY = 'craftcv_auto_skill_mode_v1';

export const DEFAULT_AI_SKILLS: AISkill[] = [
  {
    id: 'skill-embedded-rtos',
    name: '嵌入式 MCU 与 FreeRTOS 深度规范',
    category: '嵌入式/固件',
    description: '针对 STM32/GD32/ESP32 与实时操作系统，强制规范中断、DMA、多任务同步及低功耗术语。',
    isBuiltIn: true,
    skillMarkdown: `# 技能名称：嵌入式 MCU 与 FreeRTOS 固件工程深度优化规范

## 1. 适用场景
适用于电子信息工程、自动化、通信工程、嵌入式软件研发岗位的【专业技能】、【项目经历】、【实习经历】类目优化。

## 2. 核心术语升级准则（AI 阅读后必须执行）
- 禁止只写笼统的“使用串口/ADC采集数据”，必须具体到 **外设工作机制**：如 \`ADC+DMA双缓冲触发采样\`、\`UART空闲中断(IDLE)+环形缓冲区(RingBuffer)\`、\`硬件I2C/SPI时序配置\`。
- 涉及 FreeRTOS / RT-Thread 时，必须点明 **任务间同步与通信原语**：如 \`消息队列(Queue)\`、\`二值/计数信号量\`、\`互斥量(Mutex)优先级翻转防护\`、\`事件标志组(EventGroup)\` 或 \`软件定时器\`。
- 涉及系统稳定性时，补充 **看门狗(IWDG/WWDG)**、**栈水位监测(uxTaskGetStackHighWaterMark)**、**HardFault异常栈回溯定位** 等硬核工程细节。

## 3. 量化指标规范
- 采样率/控制周期（如：**1kHz 闭环控制周期**、**10ms 定时采样**）
- CPU 占用率或中断响应延迟（如：**CPU 负载降低 35%**、**中断响应时间 < 5μs**）
- 连续稳定运行时间或误码率（如：**连续 72 小时满载拷机零死机**）`,
  },
  {
    id: 'skill-peripheral-control',
    name: '外设传感与闭环控制算法技能',
    category: '控制/算法',
    description: '强化传感器信号调理、一阶/卡尔曼滤波、增量式/位置式 PID 整定及电机/电源控制闭环表述。',
    isBuiltIn: true,
    skillMarkdown: `# 技能名称：外设传感与闭环控制算法优化规范

## 1. 核心阅读与改写法则
- **信号前处理**：将“对传感器数据滤波”升级为具体算法表述，例如 **滑动平均滤波**、**一阶互补滤波**、**卡尔曼滤波(Kalman)** 或 **中位值平均抗脉冲干扰滤波**，并指出信噪比或抖动抑制效果。
- **控制算法闭环**：将“实现 PID 控制”细化为 **位置式/增量式 PID**、**积分抗饱和(Anti-windup)**、**死区补偿**、**前馈补偿** 或 **PWM 占空比死区互补输出**。
- **安全保护机制**：在电源、电机或监护设备项目中，强调 **过流/过压/过温硬件比较器快速关断** 与 **软件状态机故障自恢复**。`,
  },
  {
    id: 'skill-star-quantify',
    name: '大厂校招 STAR 法则与数据高亮技能',
    category: '通用写作法则',
    description: '按【背景挑战 -> 核心架构动作 -> 工程量化指标】三段式重构，自动用 **粗体** 标出核心数据与技术栈。',
    isBuiltIn: true,
    skillMarkdown: `# 技能名称：大厂校招 STAR 法则与关键指标高亮规范

## 1. 句式结构要求
- 每一条项目或实习要点必须以 **强有力的工程技术动词** 开头（如：*设计并实现*、*重构*、*基于...构建*、*独立负责*、*排查并定位*）。
- 严格遵循 **S/T（工程痛点/任务边界） + A（具体技术方案与底层机制） + R（可验证的量化工程结果）** 逻辑链。
- 项目经历的最后一条统一以 **“项目成果：”** 开头，总结实板联调、精度指标、功耗指标或赛事获奖情况。

## 2. 视觉重点高亮规则
- 必须使用 \`**关键词**\` 语法将 **核心芯片/框架名称** 与 **关键性能数据指标** 加粗，方便面试官 3 秒扫读抓出亮点。`,
  },
  {
    id: 'skill-hardware-fpga',
    name: '硬件原理图 / PCB 与 FPGA 数字系统技能',
    category: '硬件/FPGA',
    description: '针对立创EDA/Altium PCB Layout、电源完整性、示波器/逻辑分析仪联调及 Verilog/FPGA 时序收敛优化。',
    isBuiltIn: true,
    skillMarkdown: `# 技能名称：硬件电路 PCB 与 FPGA 数字系统工程规范

## 1. 硬件与板级联调表述准则
- 涉及原理图与 PCB 设计时，突出 **模数地分割(AGND/DGND单点接地)**、**DC-DC/LDO 电源树纹波抑制**、**差分等长走线**、**EMC/ESD 防护器件选型**。
- 涉及仪器调试时，明确体现 **示波器抓取上电时序/电源纹波**、**逻辑分析仪解码 SPI/I2C/CAN 协议波形**、**万用表与电子负载满载测试**。
- 涉及 FPGA / 数字前端时，突出 **Verilog RTL 状态机建模**、**跨时钟域同步(CDC/异步FIFO)**、**AXI-Stream 流水线吞吐优化** 及 **静态时序分析(STA)时序收敛**。`,
  },
  {
    id: 'skill-onepage-compact',
    name: '一页纸 A4 黄金信息密度精炼技能',
    category: '排版/精简',
    description: '剔除“了解了、学习了、参与了”等弱口语，将冗余长句浓缩为高含金量的干练工程短句，防止超页。',
    isBuiltIn: true,
    skillMarkdown: `# 技能名称：一页纸 A4 黄金信息密度精炼规范

## 1. 严禁出现的弱表达（AI 必须剔除）
- 严禁出现：“在项目中学习了…”、“进一步加深了对…的理解”、“锻炼了自己的动手能力”、“配合学长完成…”等学生气或被动口语。
- 严禁使用空洞形容词：“极大地提高了”、“非常优秀的”、“完美解决了”，一律替换为具体的工程动作或客观指标。

## 2. 字数与行数控制
- 每个项目要点控制在 **3~4 条** 以内，每条字数控制在 **38~55 字** 之间，确保在单页 A4 双栏排版中对齐美观、不产生孤行。`,
  },
];

export function loadAISkills(): AISkill[] {
  try {
    const raw = localStorage.getItem(STORAGE_AI_SKILLS_KEY);
    if (!raw) return DEFAULT_AI_SKILLS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_AI_SKILLS;
}

export function saveAISkills(skills: AISkill[]): void {
  try {
    localStorage.setItem(STORAGE_AI_SKILLS_KEY, JSON.stringify(skills));
  } catch {
    // ignore
  }
}

export function loadSelectedSkillIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_SELECTED_SKILLS_KEY);
    if (!raw) return ['skill-embedded-rtos', 'skill-star-quantify'];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return ['skill-embedded-rtos', 'skill-star-quantify'];
}

export function saveSelectedSkillIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_SELECTED_SKILLS_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export function loadAutoSkillMode(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_AUTO_SKILL_MODE_KEY);
    if (raw === null) return true; // Default to true: AI automatically selects suitable skills!
    return raw === 'true';
  } catch {
    return true;
  }
}

export function saveAutoSkillMode(auto: boolean): void {
  try {
    localStorage.setItem(STORAGE_AUTO_SKILL_MODE_KEY, String(auto));
  } catch {
    // ignore
  }
}

/**
 * Intelligent heuristic + content-aware pre-router that inspects the target item's content
 * and selects the most relevant skills from the user's skill library.
 */
export function recommendSkillsForTarget(
  allSkills: AISkill[],
  sectionType: string,
  sectionTitle: string,
  payload: any,
  targetRole = ''
): { matchedIds: string[]; reason: string } {
  const textBlob = `${sectionType} ${sectionTitle} ${targetRole} ${JSON.stringify(payload || {})}`.toLowerCase();
  const matched = new Set<string>();
  const reasons: string[] = [];

  const hasId = (id: string) => allSkills.some((s) => s.id === id);

  // 1. Check for MCU / RTOS / Embedded Firmware keywords
  if (
    /stm32|gd32|esp32|mcu|rtos|freertos|rt-thread|中断|dma|uart|串口|固件|任务|队列|看门狗|c语言/.test(textBlob) &&
    hasId('skill-embedded-rtos')
  ) {
    matched.add('skill-embedded-rtos');
    reasons.push('检测到 MCU/RTOS/外设中断相关内容，匹配《嵌入式 MCU 与 FreeRTOS 深度规范》');
  }

  // 2. Check for Sensor / Filtering / PID / Power / Control keywords
  if (
    /pid|adc|pwm|传感|滤波|控制|算法|采样|电源|电压|电流|电机|闭环|姿态|压力|oled|i2c|spi/.test(textBlob) &&
    hasId('skill-peripheral-control')
  ) {
    matched.add('skill-peripheral-control');
    reasons.push('检测到传感器采样/滤波/闭环控制相关内容，匹配《外设传感与闭环控制算法技能》');
  }

  // 3. Check for Hardware / PCB / FPGA / Instruments keywords
  if (
    /pcb|原理图|立创|altium|fpga|verilog|zynq|示波器|逻辑分析仪|万用表|焊接|板级|硬件|电路/.test(textBlob) &&
    hasId('skill-hardware-fpga')
  ) {
    matched.add('skill-hardware-fpga');
    reasons.push('检测到硬件电路/PCB/仪器联调或 FPGA 内容，匹配《硬件原理图 / PCB 与 FPGA 数字系统技能》');
  }

  // 4. For Projects / Experience, always include STAR quantification skill
  if (
    (sectionType === 'projects' || sectionType === 'experience' || /项目|实习|研发/.test(sectionTitle)) &&
    hasId('skill-star-quantify')
  ) {
    matched.add('skill-star-quantify');
    reasons.push('针对项目/实习经历类目，匹配《大厂校招 STAR 法则与数据高亮技能》');
  }

  // 5. For Summary / Basics / Education / Awards or compacting, include One-page compact skill
  if (
    (sectionType === 'summary' ||
      sectionType === 'basics' ||
      sectionType === 'education' ||
      sectionType === 'awards') &&
    hasId('skill-onepage-compact')
  ) {
    matched.add('skill-onepage-compact');
    reasons.push('针对简介/教育/荣誉类目，匹配《一页纸 A4 黄金信息密度精炼技能》');
  }

  // 6. Also match any user-created custom skills whose name/category/markdown keywords overlap with the item
  for (const sk of allSkills) {
    if (!sk.isBuiltIn) {
      const tokens = sk.name
        .toLowerCase()
        .split(/[\s,，、/·-]+/)
        .filter((t) => t.length >= 2);
      const hit = tokens.some((tok) => textBlob.includes(tok));
      if (hit || allSkills.filter((x) => !x.isBuiltIn).length <= 2) {
        matched.add(sk.id);
        reasons.push(`匹配用户自定义技能《${sk.name}》`);
      }
    }
  }

  // Fallback: ensure at least 2 strong skills are selected
  if (matched.size === 0) {
    if (hasId('skill-star-quantify')) matched.add('skill-star-quantify');
    if (hasId('skill-onepage-compact')) matched.add('skill-onepage-compact');
    reasons.push('自动挂载通用高含金量技术简历 STAR 规范与一页纸精炼技能');
  }

  return {
    matchedIds: Array.from(matched),
    reason: reasons.join('；'),
  };
}
