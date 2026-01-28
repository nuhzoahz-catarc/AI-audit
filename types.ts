// 定义审核状态枚举
export enum AuditStatus {
  IDLE = 'IDLE',          // 空闲状态，尚未开始处理
  PROCESSING = 'PROCESSING', // 正在处理中
  PASS = 'PASS',          // 审核通过
  FAIL = 'FAIL',          // 审核不通过（发现严重问题）
  WARNING = 'WARNING',    // 警告（发现轻微问题）
  ERROR = 'ERROR'         // 系统错误（如 API 调用失败、解析失败）
}

// 定义规则分类类型别名
export type RuleCategory = 'text_editing' | 'workflow_logic' | 'result_determination' | 'special_rules';

// 定义单条审核问题（Issue）的接口结构
export interface AuditIssue {
  rule: string;           // 违反的具体规则名称
  description: string;    // 问题详细描述
  severity: 'high' | 'medium' | 'low'; // 问题严重程度
  location?: string;      // 问题在文档中的位置（如章节名或引用文本）
  category: RuleCategory; // 问题所属分类
}

// 定义审核结果的接口结构
export interface AuditResult {
  status: AuditStatus;    // 整体审核状态
  summary: string;        // AI 生成的执行摘要
  issues: AuditIssue[];   // 发现的问题列表
  processedAt: string;    // 处理完成的时间戳
}

// 定义文档文件的接口结构（应用核心数据模型）
export interface DocFile {
  id: string;             // 文件唯一标识符 (前端生成)
  file: File;             // 原始 File 对象 (来自 input type="file")
  content: string;        // 提取出的文档内容 (HTML 字符串)
  auditResult?: AuditResult; // 审核结果 (可选，处理前为空)
  isProcessing: boolean;  // 当前是否正在被 AI 处理
}

// 定义审核规则配置的接口结构
export interface RuleConfig {
  id: string;             // 规则唯一标识符
  text: string;           // 规则的具体内容文本
  enabled: boolean;       // 规则是否启用
  category: RuleCategory; // 规则所属分类
}