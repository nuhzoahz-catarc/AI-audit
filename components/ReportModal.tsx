import React from 'react';
import { DocFile, AuditStatus, RuleCategory } from '../types';
import { X, CheckCircle, XCircle, AlertTriangle, AlertOctagon, FileText } from 'lucide-react';

// 组件属性接口
interface Props {
  file: DocFile;
  onClose: () => void;
}

// 规则分类映射配置 (重复定义，实际项目中可提取到常量文件)
const CATEGORY_MAP: Record<RuleCategory, { label: string; color: string; bg: string; border: string }> = {
  text_editing: { label: '文本编辑', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
  workflow_logic: { label: '流转逻辑', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
  result_determination: { label: '结果判定', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
  special_rules: { label: '特殊规则', color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
};

const ReportModal: React.FC<Props> = ({ file, onClose }) => {
  if (!file.auditResult) return null; // 如果没有结果，不渲染

  const { status, summary, issues } = file.auditResult;

  // 根据审核状态获取头部背景色
  const getHeaderColor = () => {
    switch (status) {
      case AuditStatus.PASS: return "bg-green-600";
      case AuditStatus.FAIL: return "bg-red-600";
      case AuditStatus.WARNING: return "bg-amber-500";
      default: return "bg-slate-600";
    }
  };

  // 获取状态中文标签
  const getStatusLabel = (s: AuditStatus) => {
     switch(s) {
       case AuditStatus.PASS: return "通过";
       case AuditStatus.FAIL: return "不通过";
       case AuditStatus.WARNING: return "警告";
       default: return s;
     }
  };

  // 根据严重程度获取对应的图标
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertOctagon className="w-6 h-6 text-red-600" />;
      case 'medium': return <AlertTriangle className="w-6 h-6 text-amber-500" />;
      case 'low': return <AlertTriangle className="w-6 h-6 text-blue-500" />;
      default: return null;
    }
  };

  // 获取严重程度中文标签
  const getSeverityLabel = (severity: string) => {
      switch(severity) {
          case 'high': return '高风险';
          case 'medium': return '中风险';
          case 'low': return '低风险';
          default: return severity;
      }
  };

  // 获取分类标签组件
  const getCategoryBadge = (category: RuleCategory) => {
    // 兜底处理：如果分类未定义，使用特殊规则样式
    const style = CATEGORY_MAP[category] || CATEGORY_MAP.special_rules;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${style.bg} ${style.color} ${style.border}`}>
        {style.label}
      </span>
    );
  };

  return (
    // 模态框背景遮罩
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-6">
      // 模态框主容器
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* 头部区域：显示文件名和总体状态 */}
        <div className={`${getHeaderColor()} p-8 flex items-center justify-between text-white shrink-0 shadow-md`}>
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-4">
              {status === AuditStatus.PASS && <CheckCircle className="w-10 h-10" />}
              {status === AuditStatus.FAIL && <XCircle className="w-10 h-10" />}
              {status === AuditStatus.WARNING && <AlertTriangle className="w-10 h-10" />}
              {file.file.name}
            </h2>
            <p className="text-white/90 text-base mt-3 font-medium opacity-90">审批状态: {getStatusLabel(status)}</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-8 h-8" />
          </button>
        </div>

        {/* 内容区域：可滚动 */}
        <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-slate-50">
          
          {/* 执行摘要部分 */}
          <section className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-base font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                执行摘要
            </h3>
            <p className="text-slate-700 leading-loose text-lg">{summary}</p>
          </section>

          {/* 详细问题列表 */}
          <section>
            <h3 className="text-base font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center justify-between">
              <span>详细发现</span>
              {issues.length > 0 && <span className="text-sm bg-red-100 text-red-600 px-4 py-1.5 rounded-full font-bold">{issues.length} 个问题</span>}
            </h3>

            {issues.length === 0 ? (
              // 无问题时的空状态显示
              <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                <CheckCircle className="w-20 h-20 text-green-200 mx-auto mb-5" />
                <p className="text-slate-500 font-medium text-xl">未发现问题。</p>
                <p className="text-slate-400 text-lg mt-2">报告符合所有预设规则！</p>
              </div>
            ) : (
              // 问题列表
              <div className="space-y-5">
                {issues.map((issue, idx) => (
                  <div key={idx} className="flex gap-6 p-6 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all bg-white group">
                    <div className="mt-1 shrink-0 bg-slate-50 p-3 rounded-lg h-fit group-hover:bg-white transition-colors">
                      {getSeverityIcon(issue.severity)}
                    </div>
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-4 flex-wrap">
                        {getCategoryBadge(issue.category)}
                        <span className={`text-sm font-bold px-3 py-1.5 rounded uppercase tracking-wide
                          ${issue.severity === 'high' ? 'bg-red-50 text-red-600 border border-red-100' : 
                            issue.severity === 'medium' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 
                            'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                          {getSeverityLabel(issue.severity)}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-800 text-lg mt-1">{issue.rule}</h4>
                      <p className="text-slate-600 text-base leading-relaxed">{issue.description}</p>
                      {issue.location && (
                         <div className="text-sm text-slate-400 mt-4 font-mono bg-slate-50 p-2.5 rounded border border-slate-100 inline-block">
                           位置: {issue.location}
                         </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* 底部按钮栏 */}
        <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-4 shrink-0">
          <button 
            onClick={onClose}
            className="px-8 py-3 text-slate-600 hover:bg-slate-100 rounded-xl text-base font-bold transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;