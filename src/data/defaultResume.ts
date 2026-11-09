import type { ResumeDocument } from '../types/resume';

export const AVATAR_PRESETS = {
  maleEE: '/src/assets/images/avatar_ee_candidate_1793950974558.jpg',
  femaleTech: '/src/assets/images/avatar_tech_female_1793950975083.jpg',
};

export const ACCENT_COLORS = [
  { name: '经典碳灰 (PDF 原版配色)', value: '#666666', lightBg: '#f5f5f5', border: '#d4d4d4' },
  { name: '深科蓝 (Tech Cobalt)', value: '#1d4ed8', lightBg: '#eff6ff', border: '#bfdbfe' },
  { name: '极客黑 (Graphite Slate)', value: '#222222', lightBg: '#f1f5f9', border: '#cbd5e1' },
  { name: '芯片青 (Silicon Teal)', value: '#0f766e', lightBg: '#f0fdfa', border: '#99f6e4' },
  { name: '学院红 (Academic Crimson)', value: '#b91c1c', lightBg: '#fef2f2', border: '#fecaca' },
  { name: '深海靛 (Executive Indigo)', value: '#3730a3', lightBg: '#eef2ff', border: '#c7d2fe' },
];

// 1:1 PDF Structure & Rhythm with Sample EE Content (Default)
export const DEFAULT_EE_RESUME: ResumeDocument = {
  id: 'ee-default-pdf-1to1',
  versionName: '电子信息工程示例简历（PDF 1:1 版式）',
  updatedAt: new Date().toISOString(),
  basics: {
    name: '林致远',
    title: '嵌入式软件工程师',
    directionTags: 'MCU 固件 / 实时系统 / 智能控制',
    phone: '138-0013-8920',
    email: 'zhiyuan.lin@ee-tech.edu.cn',
    location: '深圳 / 郑州 / 杭州',
    github: 'github.com/linzhiyuan-ee',
    website: 'linzhiyuan-lab.dev',
    schoolTag: '电子科技大学',
    statusTag: '电子信息工程 · 2027 届本科 · 随时到岗',
    politicalStatus: '中共党员',
    graduationYear: '2027届本科',
    avatarUrl: AVATAR_PRESETS.maleEE,
    showAvatar: true,
    avatarPosition: 'left',
    summary:
      '具备 STM32H7、TI MSPM0G3507 固件开发与实机联调经验，参与多通道实时监测终端和智能车控制系统开发；熟悉 FreeRTOS、高速外设驱动、PID 控制及四层 PCB 设计。',
  },
  sections: [
    { id: 'sec-edu', type: 'education', title: '教育背景', englishTitle: 'EDUCATION', visible: true, column: 'left' },
    { id: 'sec-skills', type: 'skills', title: '专业技能', englishTitle: 'EXPERTISE', visible: true, column: 'left' },
    { id: 'sec-awards', type: 'awards', title: '证书与荣誉', englishTitle: 'ACHIEVEMENT', visible: true, column: 'left' },
    { id: 'sec-summary', type: 'summary', title: '个人简介', englishTitle: 'ABOUT ME', visible: true, column: 'right' },
    { id: 'sec-proj', type: 'projects', title: '项目经历', englishTitle: 'PROJECT EXPERIENCE', visible: true, column: 'right' },
    { id: 'sec-exp', type: 'experience', title: '实习经历', englishTitle: 'INTERNSHIP EXPERIENCE', visible: true, column: 'right' },
  ],
  education: [
    {
      id: 'edu-1',
      school: '电子科技大学',
      degree: '本科',
      major: '电子信息工程（本科）',
      startDate: '2025.07',
      endDate: '2027.06',
      gpa: '3.87/5.00（均分 88.75）',
      ranking: '',
      courses: '嵌入式微控制器、数字信号处理、模拟电子技术、FPGA 系统设计',
      honors: '每学期获校级二等奖学金',
    },
    {
      id: 'edu-2',
      school: '电子信息工程学院（理工部）',
      degree: '专科/前段培养',
      major: '应用电子与软件技术（嵌入式方向）',
      startDate: '2022.07',
      endDate: '2025.06',
      gpa: '3.85/5.00（均分 88.54）',
      ranking: '',
      courses: 'C语言程序设计、面向对象程序设计、单片机原理与接口技术、硬件测试',
      honors: '每学期获校级一等奖学金',
    },
  ],
  projects: [
    {
      id: 'proj-1',
      name: 'FreeRTOS 智能环境监测与交互告警终端',
      role: '独立开发',
      startDate: '2026.09',
      endDate: '2026.10',
      repoUrl: 'https://github.com/linzhiyuan-ee/stm32-freertos-env-monitor',
      techStack: ['STM32F103C8T6', 'FreeRTOS', 'ADC', 'UART', 'Flash/CRC'],
      summary: '',
      bullets: [
        '基于 FreeRTOS 拆分采集、交互、告警、OLED 显示、串口、存储及振动监测 7 个任务；通过消息队列传递采样数据、互斥量保护共享配置，并以事件组和软件定时器协调状态。',
        '实现 NTC 100ms 周期 ADC 采样、8 点滑动滤波与开短路诊断，引入 1°C 温度回差和分级告警状态机；设计 OLED 三级菜单，支持按键、编码器和串口调参及 Flash/CRC 延时保存。',
        '项目成果：完成 7 任务实板满载验证；实现 10 秒静音恢复、16 条告警快照循环记录及异常掉电后配置恢复。',
      ],
    },
    {
      id: 'proj-2',
      name: '车载平衡滚球智能车控制系统',
      role: '核心固件开发',
      startDate: '2026.07',
      endDate: '2026.08',
      repoUrl: 'https://github.com/linzhiyuan-ee/mspm0-k210-balance-car',
      techStack: ['TI MSPM0G3507', 'K210', 'C', '滤波 PD/PID', 'UART/PWM'],
      summary: '',
      bullets: [
        '采集五路红外传感器，按 −4/−2/0/2/4 权重计算横向偏差并输出滤波 PD 差速控制；丢线时按最后有效方向低速寻线，超时自动停车。',
        '联调 MSPM0 与 K210 的 UART 坐标帧协议，实现 PID 舵机控制；结合坐标滑动滤波、误差死区和 PID 分段整定，并设置舵机安全限幅及视觉丢帧回中。',
        '项目成果：完成传感、运动控制和视觉通信模块联调；循迹及滚球控制已开展实车调试，仍需进一步校准验证。',
      ],
    },
    {
      id: 'proj-3',
      name: 'Cyclone IV FPGA 四层最小系统板',
      role: '独立硬件设计',
      startDate: '2025.12',
      endDate: '2026.01',
      repoUrl: 'https://github.com/linzhiyuan-ee/cyclone4-fpga-4layer-pcb',
      techStack: ['EP4CE6E22C8N', 'Altium Designer 20', '四层 PCB', 'JTAG/EPCS4'],
      summary: '',
      bullets: [
        '依据器件资料设计 Type-C 5V 输入、3.3V/2.5V/1.2V 电源树及去耦网络，完成 50MHz 时钟、复位、JTAG 和 EPCS4 配置电路。',
        '采用 Top/GND/Power/Bottom 四层叠构，完成电源平面分割与信号回流设计；扩展 4 路按键/LED、双组 2×24 排针，并建立符号及封装库。',
        '项目成果：交付原理图、封装库、四层 PCB 工程和 BOM，并完成电源、关键信号及 DFM/DRC 静态规则检查。',
      ],
    },
  ],
  experience: [
    {
      id: 'exp-1',
      company: '中科华积电科技有限公司',
      position: '硬件研发实习生（FPGA / PCB）',
      department: '',
      location: '郑州',
      startDate: '2025.12',
      endDate: '2026.01',
      techStack: ['FPGA', 'Altium Designer 20', '四层PCB'],
      bullets: [
        '依据芯片资料核对多电源域管脚、Bank 电压及 JTAG/EPCS4 配置接口；使用 AD20 建立原理图符号与焊盘封装，参与四层板模块化布局布线、关键信号检查和工程文档归档。',
      ],
    },
    {
      id: 'exp-2',
      company: '库课科技研发中心',
      position: '软件工程师实习生（技术部）',
      department: '',
      location: '郑州',
      startDate: '2024.08',
      endDate: '2025.06',
      techStack: ['系统监测', '异常排查', '回归验证'],
      bullets: [
        '负责业务系统运行监测和线上异常排查，完成场景复现、环境定位与回归验证；整理典型故障处理记录。',
      ],
    },
  ],
  skills: [
    {
      id: 'sk-1',
      category: 'MCU 与实时系统',
      items: '嵌入式 C（指针、内存管理、状态机）；STM32F103、MSPM0G3507；FreeRTOS 任务调度、队列、互斥量、事件组和软件定时器。',
    },
    {
      id: 'sk-2',
      category: '外设与控制算法',
      items: 'UART（RXNE/IDLE 帧解析）、ADC、PWM、SPI、I²C；PID 整定、滑动滤波、滞回消抖、超时保护和 Flash/CRC 存储。',
    },
    {
      id: 'sk-3',
      category: '工具链与 AI 辅助',
      items: 'Keil MDK、CubeMX、ST-Link、Altium Designer 20、Git；使用 AI 工具辅助固件开发与联调。',
    },
  ],
  awards: [
    {
      id: 'aw-1',
      title: '计算机软件测试员职业技能等级证书',
      issuer: '',
      date: '',
      level: '三级 / 高级工',
      description: '',
    },
    {
      id: 'aw-2',
      title: '河南省高职技能大赛软件测试赛项团体三等奖',
      issuer: '',
      date: '2023',
      level: '',
      description: '',
    },
  ],
  customSections: [],
  style: {
    template: 'pdf-classic',
    accentColor: '#666666',
    fontSize: 'md',
    lineHeight: 'tight',
    pageMargin: 'standard',
    showPageBreakGuide: true,
    showIcons: true,
  },
};

// Do not commit real resumes or contact details as built-in presets.
// Users import personal documents locally using the file import dialog.

export const DEMO_GITHUB_REPOS = [
  {
    id: 101,
    name: 'stm32-foc-bldc-controller',
    full_name: 'ee-openlab/stm32-foc-bldc-controller',
    html_url: 'https://github.com/ee-openlab/stm32-foc-bldc-controller',
    description: 'High-performance Field Oriented Control (FOC) brushless motor driver based on STM32G474, CORDIC hardware accelerator, and current loop ADC injection sampling.',
    language: 'C',
    stargazers_count: 248,
    forks_count: 62,
    updated_at: '2026-10-18T10:00:00Z',
    topics: ['stm32', 'foc', 'motor-control', 'embedded-c', 'pid-control'],
    readme: `# STM32G474 Hardware-Accelerated FOC Motor Controller
Designed a compact 3-phase BLDC/PMSM Field Oriented Control (FOC) driver board and firmware.
- Features: 20kHz SVPWM current loop using ADC1/ADC2 injected dual-shunt sampling + DMA.
- Uses STM32G4 built-in CORDIC co-processor for fast Park/Clarke sin/cos transforms, reducing ISR execution time to 4.2us.
- Supports CAN-FD velocity/position closed-loop commands and Python real-time waveform oscilloscope upper-computer.`,
  },
  {
    id: 102,
    name: 'fpga-ofdm-baseband-transceiver',
    full_name: 'ee-openlab/fpga-ofdm-baseband-transceiver',
    html_url: 'https://github.com/ee-openlab/fpga-ofdm-baseband-transceiver',
    description: 'Verilog implementation of an IEEE 802.11a compatible OFDM baseband transceiver on Xilinx Kintex-7 FPGA with QPSK/16QAM modulation, Viterbi decoder, and Schmidl-Cox synchronization.',
    language: 'Verilog',
    stargazers_count: 176,
    forks_count: 41,
    updated_at: '2026-09-25T08:30:00Z',
    topics: ['fpga', 'verilog', 'ofdm', 'wireless-communication', 'dsp'],
    readme: `# FPGA OFDM Baseband Transceiver
Full RTL implementation of an Orthogonal Frequency Division Multiplexing (OFDM) physical layer baseband modem.
- Implements Schmidl-Cox packet detection, coarse/fine carrier frequency offset (CFO) compensation, 64-point radix-22 pipelined IFFT/FFT, and pilot-based LS channel estimation.
- Verified with MATLAB golden reference vectors and AD9361 RF transceiver loopback at 20MHz bandwidth.`,
  },
  {
    id: 103,
    name: 'embedded-linux-rk3588-radar-fusion',
    full_name: 'ee-openlab/embedded-linux-rk3588-radar-fusion',
    html_url: 'https://github.com/ee-openlab/embedded-linux-rk3588-radar-fusion',
    description: 'Millimeter-wave radar (TI AWR1843) and monocular camera multi-sensor spatial-temporal calibration and Extended Kalman Filter (EKF) target tracking on RK3588 Embedded Linux.',
    language: 'C++',
    stargazers_count: 142,
    forks_count: 29,
    updated_at: '2026-10-29T14:20:00Z',
    topics: ['mmwave-radar', 'kalman-filter', 'rk3588', 'embedded-linux', 'cpp17'],
    readme: `# Millimeter-Wave Radar & Vision EKF Fusion on RK3588
Multi-target tracking pipeline running on Rockchip RK3588 Linux platform.
- Parses point-cloud frames from TI AWR1843 77GHz mmWave radar over high-speed UART/CAN.
- Implements Hungarian data association + Extended Kalman Filter (EKF) in C++17 with Eigen, achieving <8ms frame latency and 94.8% MOTA tracking accuracy.`,
  },
];

export const PRESET_JDS = [
  {
    id: 'jd-embedded',
    title: '嵌入式软件研发工程师（校招/应届）',
    company: '头部智能硬件 / 机器人 / 无人机企业',
    content: `岗位职责：
1. 负责机器人/无人机或智能硬件产品的嵌入式系统架构设计与底层固件开发（基于 STM32/TI MSPM0/ARM Cortex-M 或 FreeRTOS）；
2. 负责常见传感器（IMU、编码器、ADC、红外/视觉模块等）的接口驱动开发（SPI/I2C/UART/CAN-FD/PWM）及 DMA 高速数据传输优化；
3. 参与硬件原理图评审、四层 PCB 板级 Bring-up 调试、功耗优化与系统稳定性压测。
任职要求：
1. 电子信息工程、自动化、通信工程、计算机等相关专业本科及以上学历；
2. 扎实的 C/C++ 语言基础，熟练掌握 FreeRTOS 等实时操作系统任务调度与同步机制；
3. 熟悉数字信号处理基础（滑动滤波、PID控制、卡尔曼滤波），熟练使用 Keil MDK、CubeMX、Altium Designer；
4. 有全国大学生电子设计竞赛、智能车获奖经历或高质量 GitHub 开源嵌入式项目者优先。`,
  },
  {
    id: 'jd-fpga',
    title: 'FPGA / 硬件研发工程师（校招）',
    company: '通信设备 / 芯片设计 / 工业控制企业',
    content: `岗位职责：
1. 负责 FPGA 最小系统与高速采集板卡的原理图设计、四层/多层 PCB 布局布线与电源完整性分析；
2. 负责 Cyclone / Zynq 平台的 RTL 逻辑设计、外设接口配置及板级联调验证；
3. 编写硬件设计文档、BOM 表及执行 DFM/DRC 静态规则检查。`,
  },
  {
    id: 'jd-cpp',
    title: 'C++ / 嵌入式 Linux 研发工程师',
    company: '通信大厂 / 自动驾驶 / 工业软件核心部门',
    content: `岗位职责：
1. 负责边缘计算节点或智能终端下 C/C++ 核心控制模块、多任务通信与传感器融合算法开发；
2. 负责串口协议帧解析、状态机设计、Flash/CRC 掉电保护及系统异常恢复机制实现。`,
  },
];
