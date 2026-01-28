import React, { useState, useEffect, useRef } from 'react';
import { DocFile, AuditStatus, RuleConfig, RuleCategory } from '../types';
import { extractContentFromDocx } from '../services/wordParser';
import { analyzeReport } from '../services/auditService';
import { parseRulesFile, downloadRuleTemplate, exportRulesToExcel, saveFile } from '../services/ruleImporter';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Play, Trash2, Settings, Loader2, Plus, X, AlertOctagon, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download, FileUp, FileDown, Eye, FileOutput } from 'lucide-react';
import ReportModal from './ReportModal';
import PreviewModal from './PreviewModal';

// 默认的审核规则列表，在应用初始化时加载
const DEFAULT_RULES_LIST: { text: string; category: RuleCategory }[] = [
  { text: "“收样日期”必须早于或等于“检测日期”。", category: 'workflow_logic' },
  { text: "表格中的所有数值型“检测结果”必须符合“标准要求”或“技术指标”列中规定的范围。", category: 'result_determination' },
  { text: "报告中必须包含明确的“结论”或“判定”章节。", category: 'text_editing' },
  { text: "报告编号（Report ID）必须出现在页眉或标题中。", category: 'text_editing' }
];

// 规则分类的视觉映射配置 (标签名、颜色、背景、边框)
const CATEGORY_MAP: Record<RuleCategory, { label: string; color: string; bg: string; border: string }> = {
  text_editing: { label: '文本编辑', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
  workflow_logic: { label: '流转逻辑', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
  result_determination: { label: '结果判定', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
  special_rules: { label: '特殊规则', color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
};

const ITEMS_PER_PAGE = 5; // 规则列表每页显示数量
const CONCURRENT_LIMIT = 3; // ★★★ 批量审批时的并发请求限制，防止触发 API 速率限制 ★★★

const Dashboard: React.FC = () => {
  // --- 状态定义 ---
  const [files, setFiles] = useState<DocFile[]>([]); // 上传的文件列表
  // 规则列表状态，初始化时加载默认规则
  const [rules, setRules] = useState<RuleConfig[]>(
    DEFAULT_RULES_LIST.map((item, index) => ({
      id: `default-${index}`,
      text: item.text,
      category: item.category,
      enabled: true // 默认启用
    }))
  );
  const [newRuleInput, setNewRuleInput] = useState(""); // 新规则输入框内容
  const [newRuleCategory, setNewRuleCategory] = useState<RuleCategory>('text_editing'); // 新规则分类选择
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  
  const [isProcessingBatch, setIsProcessingBatch] = useState(false); // 是否正在进行批量审批
  const [selectedFile, setSelectedFile] = useState<DocFile | null>(null); // 当前选中查看详情的文件 (弹窗用)
  const [previewFile, setPreviewFile] = useState<DocFile | null>(null); // 当前选中预览的文件 (预览窗用)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set()); // 记录哪些文件在列表中处于“展开”状态
  const [isDragOver, setIsDragOver] = useState(false); // 拖拽悬停状态
  
  // 用于触发隐藏文件输入框的 Ref
  const ruleFileInputRef = useRef<HTMLInputElement>(null);

  // 当规则数量变化时，自动修正当前页码 (防止停留在空白页)
  useEffect(() => {
    const totalPages = Math.ceil(rules.length / ITEMS_PER_PAGE) || 1;
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [rules.length, currentPage]);

  // --- 文件处理逻辑 ---

  // 处理新上传或拖拽进入的文件
  const processNewFiles = (fileList: File[]) => {
    const newDocFiles: DocFile[] = [];
    
    fileList.forEach(file => {
      // 检查文件名重复
      const existingIndex = files.findIndex(f => f.file.name === file.name);
      if (existingIndex !== -1) {
        if (!window.confirm(`文件 "${file.name}" 已存在。是否覆盖？`)) {
          return; // 用户取消覆盖，跳过此文件
        }
        // 如果确认覆盖，先移除旧文件
        removeFile(files[existingIndex].id);
      }

      // 创建新的 DocFile 对象
      newDocFiles.push({
        id: Math.random().toString(36).substring(7), // 生成随机 ID
        file,
        content: '', // 内容稍后解析
        isProcessing: false,
        auditResult: undefined
      });
    });

    if (newDocFiles.length > 0) {
      // 更新文件列表状态，合并新文件 (注意：由于 removeFile 是异步状态更新，这里使用过滤逻辑确保不重复)
      setFiles(prev => {
        const namesToRemove = new Set(newDocFiles.map(nf => nf.file.name));
        const filteredPrev = prev.filter(f => !namesToRemove.has(f.file.name));
        return [...filteredPrev, ...newDocFiles];
      });
    }
  };

  // 处理点击上传按钮的事件
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      processNewFiles(Array.from(event.target.files));
    }
    event.target.value = ''; // 重置 input，允许重复上传同名文件
  };

  // 拖拽悬停事件
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true); // 设置悬停样式
  };

  // 拖拽离开事件
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false); // 取消悬停样式
  };

  // 拖拽释放 (Drop) 事件
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      // 使用强制类型转换将 DataTransferFileList 转为 File[]
      const droppedFiles = (Array.from(e.dataTransfer.files) as File[]).filter(f => 
        f.name.endsWith('.docx') || f.name.endsWith('.DOCX')
      );
      if (droppedFiles.length > 0) {
        processNewFiles(droppedFiles);
      } else {
        alert("请拖拽 .docx 格式的文件");
      }
    }
  };

  // 从列表中移除文件
  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  // “另存为/打开”逻辑
  const openLocalFile = async (file: File) => {
      // 这里的逻辑是：调用系统的“另存为”对话框，让用户选择保存位置。
      // 保存后，用户可以在本地双击打开（如用 Word 或 WPS）。
      // 浏览器安全沙箱禁止网页直接启动本地应用程序（如 exe）来打开内存中的文件。
      await saveFile(file, file.name, [{
          description: 'Word Document',
          accept: {'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']}
      }]);
  };

  // --- 规则管理逻辑 ---

  // 添加新规则
  const addRule = () => {
    if (!newRuleInput.trim()) return;
    const newRule: RuleConfig = {
      id: Date.now().toString(),
      text: newRuleInput.trim(),
      category: newRuleCategory,
      enabled: true
    };
    setRules([...rules, newRule]);
    setNewRuleInput("");
    // 自动跳转到最后一页以显示新规则
    setTimeout(() => {
        setCurrentPage(Math.ceil((rules.length + 1) / ITEMS_PER_PAGE));
    }, 0);
  };

  // 移除规则
  const removeRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  // 切换规则启用/禁用状态
  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  // 导入规则文件 (Excel/CSV)
  const handleRuleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          try {
              const importedRules = await parseRulesFile(e.target.files[0]);
              setRules(prev => [...prev, ...importedRules]);
              alert(`成功导入 ${importedRules.length} 条规则`);
          } catch (err: any) {
              alert(err.message);
          }
      }
      e.target.value = '';
  };

  // --- 核心审批逻辑 ---

  // 处理单个文件
  const processFile = async (docFile: DocFile) => {
    try {
      let content = docFile.content;
      // 如果还没解析过内容，先解析 Docx -> HTML
      if (!content) {
        content = await extractContentFromDocx(docFile.file);
      }

      // 获取当前启用的规则文本
      const activeRuleTexts = rules.filter(r => r.enabled).map(r => r.text);
      
      // ★★★ [GEMINI AI] 调用 AI 服务进行分析 ★★★
      const result = await analyzeReport(content, activeRuleTexts);

      // 返回更新后的文件对象
      return { ...docFile, content, auditResult: result, isProcessing: false };
    } catch (error) {
      console.error(error);
      return {
        ...docFile,
        isProcessing: false,
        auditResult: {
          status: AuditStatus.ERROR,
          summary: "文件处理失败。",
          issues: [],
          processedAt: new Date().toISOString()
        }
      };
    }
  };

  // 批量审批 (并发控制)
  const runBatchAudit = async () => {
    setIsProcessingBatch(true);
    // 筛选出未审批的文件
    const filesToProcess = files.filter(f => !f.auditResult);
    
    // 将这些文件标记为“处理中” (UI 显示 loading)
    setFiles(prev => prev.map(f => filesToProcess.find(ftp => ftp.id === f.id) ? { ...f, isProcessing: true } : f));

    // 创建任务队列副本
    const queue = [...filesToProcess];
    
    // 定义 Worker 函数：不断从队列中取任务直到队列为空
    const worker = async () => {
        while (queue.length > 0) {
            const file = queue.shift(); // 取出一个文件
            if (!file) break;
            
            // 处理该文件
            const processed = await processFile({ ...file, isProcessing: true });
            
            // 更新该文件的状态 (部分更新)
            setFiles(prev => prev.map(f => f.id === processed.id ? processed : f));
            
            // 如果发现问题，自动展开该文件的详情区域
            if (processed.auditResult && processed.auditResult.issues.length > 0) {
                setExpandedFiles(prev => new Set(prev).add(processed.id));
            }
        }
    };

    // 创建并发 Worker 池 (数量为 CONCURRENT_LIMIT)
    const workers = Array(Math.min(filesToProcess.length, CONCURRENT_LIMIT)).fill(null).map(() => worker());
    
    // 等待所有 Worker 完成
    await Promise.all(workers);
    
    setIsProcessingBatch(false);
  };

  // 导出 CSV 报告
  const exportToCSV = async (file: DocFile) => {
    if (!file.auditResult) return;
    const { status, summary, issues } = file.auditResult;
    const bom = "\uFEFF"; // 添加 BOM 以确保 Excel 正确识别 UTF-8
    let csvContent = bom + "文件名,审批状态,执行摘要,错误分类,规则名称,详细描述,严重程度,位置\n";
    
    // CSV 转义函数
    const escape = (text: string) => {
      if (!text) return "";
      const stringText = String(text);
      if (stringText.includes(",") || stringText.includes("\"") || stringText.includes("\n")) {
        return `"${stringText.replace(/"/g, '""')}"`;
      }
      return stringText;
    };
    
    const statusLabel = status === AuditStatus.PASS ? '通过' : status === AuditStatus.FAIL ? '不通过' : status === AuditStatus.WARNING ? '警告' : status;
    const commonData = `${escape(file.file.name)},${escape(statusLabel)},${escape(summary)}`;
    
    if (issues.length === 0) {
      csvContent += `${commonData},,,,,\n`;
    } else {
      issues.forEach(issue => {
        const categoryLabel = CATEGORY_MAP[issue.category]?.label || issue.category;
        const severityLabel = issue.severity === 'high' ? '高' : issue.severity === 'medium' ? '中' : '低';
        const row = `${commonData},${escape(categoryLabel)},${escape(issue.rule)},${escape(issue.description)},${escape(severityLabel)},${escape(issue.location || '')}`;
        csvContent += row + "\n";
      });
    }
    
    // 生成 Blob 并调用另存为
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const filename = `audit_report_${file.file.name.replace(/\.[^/.]+$/, "")}_${new Date().getTime()}.csv`;
    
    await saveFile(blob, filename, [{
        description: 'CSV File',
        accept: {'text/csv': ['.csv']}
    }]);
  };

  // --- UI 辅助函数 ---

  // 根据状态获取对应的图标
  const getStatusIcon = (status?: AuditStatus) => {
    switch (status) {
      case AuditStatus.PASS: return <CheckCircle className="w-6 h-6 text-green-500" />;
      case AuditStatus.FAIL: return <XCircle className="w-6 h-6 text-red-500" />;
      case AuditStatus.WARNING: return <AlertTriangle className="w-6 h-6 text-amber-500" />;
      case AuditStatus.ERROR: return <AlertTriangle className="w-6 h-6 text-gray-500" />;
      case AuditStatus.PROCESSING: return <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />;
      default: return <div className="w-6 h-6 rounded-full border-2 border-slate-200" />;
    }
  };

  // 获取严重程度徽章
  const getSeverityBadge = (severity: string) => {
      switch(severity) {
          case 'high': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-bold bg-red-100 text-red-700 border border-red-200"><AlertOctagon className="w-4 h-4"/> 高</span>;
          case 'medium': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-bold bg-amber-100 text-amber-700 border border-amber-200"><AlertTriangle className="w-4 h-4"/> 中</span>;
          case 'low': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-bold bg-blue-100 text-blue-700 border border-blue-200"><AlertTriangle className="w-4 h-4"/> 低</span>;
          default: return severity;
      }
  };

  // 获取分类徽章
  const getCategoryBadge = (category: RuleCategory) => {
    const style = CATEGORY_MAP[category] || CATEGORY_MAP.special_rules;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${style.bg} ${style.color} ${style.border}`}>
        {style.label}
      </span>
    );
  };

  // 切换列表项展开/折叠
  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedFiles);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedFiles(newSet);
  };

  // 分页计算
  const totalPages = Math.ceil(rules.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentRules = rules.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const goToPrevious = () => setCurrentPage(p => Math.max(1, p - 1));
  const goToNext = () => setCurrentPage(p => Math.min(totalPages, p + 1));

  // --- 渲染逻辑 ---

  return (
    <div className="flex flex-col h-screen bg-sky-50 overflow-hidden text-base">
      {/* 头部导航栏 */}
      <header className="bg-white border-b border-sky-100 h-20 flex items-center justify-between px-8 z-10 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2.5 rounded-lg shadow-blue-200 shadow-md">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">SmartAudit Pro <span className="text-base font-normal text-slate-500 ml-3">智能审批系统</span></h1>
        </div>
        <div className="flex items-center gap-4">
           {/* 批量审批按钮 */}
           <button 
             onClick={runBatchAudit}
             disabled={isProcessingBatch || files.length === 0}
             className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-lg text-white transition-all transform active:scale-95
               ${isProcessingBatch || files.length === 0 
                 ? 'bg-slate-300 cursor-not-allowed' 
                 : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-200'}`}
           >
             {isProcessingBatch ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
             开始批量审批
           </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧边栏：规则管理 */}
        <div className="w-[420px] bg-white border-r border-sky-100 flex flex-col shrink-0 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-0">
          <div className="p-6 border-b border-sky-50 bg-sky-50/50 flex flex-col gap-4 shrink-0">
            <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-slate-700">自定义审批规则</h2>
                <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">{rules.length}</span>
            </div>
            
            {/* 规则导入/导出 按钮组 */}
            <div className="flex gap-2">
                <input 
                    type="file" 
                    ref={ruleFileInputRef}
                    onChange={handleRuleImport}
                    accept=".xlsx, .xls, .csv" 
                    className="hidden"
                />
                <button 
                    onClick={() => ruleFileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 px-3 py-2 rounded-lg transition-all"
                >
                    <FileUp className="w-4 h-4" /> 导入规则
                </button>
                 <button 
                    onClick={() => exportRulesToExcel(rules)}
                    className="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 px-3 py-2 rounded-lg transition-all"
                >
                    <FileDown className="w-4 h-4" /> 导出规则
                </button>
            </div>
            <div className="text-center">
                 <button 
                    onClick={downloadRuleTemplate}
                    className="text-sm text-blue-500 hover:underline hover:text-blue-700"
                >
                    下载规则导入模板 (.xlsx)
                </button>
            </div>
          </div>
          
          {/* 添加新规则输入区 */}
          <div className="p-5 border-b border-slate-100 bg-white shrink-0 space-y-3">
             <div className="relative">
                <select 
                  value={newRuleCategory} 
                  onChange={(e) => setNewRuleCategory(e.target.value as RuleCategory)}
                  className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 pr-8"
                >
                  {Object.entries(CATEGORY_MAP).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                  <ChevronDown className="w-4 h-4" />
                </div>
             </div>

             <div className="flex gap-3">
               <input 
                 type="text" 
                 value={newRuleInput}
                 onChange={(e) => setNewRuleInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && addRule()}
                 placeholder="输入规则内容..."
                 className="flex-1 px-4 py-2.5 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
               />
               <button 
                 onClick={addRule}
                 disabled={!newRuleInput.trim()}
                 className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white p-2.5 rounded-lg transition-colors shrink-0"
               >
                 <Plus className="w-6 h-6" />
               </button>
             </div>
          </div>

          {/* 规则列表区域 (带分页) */}
          <div className="flex-1 p-5 overflow-y-auto bg-slate-50/50">
             <ul className="flex flex-col gap-4">
               {currentRules.map((rule, index) => (
                 <li 
                    key={rule.id} 
                    className={`group relative flex flex-col gap-3 p-5 rounded-xl border shadow-sm transition-all duration-200 
                      ${rule.enabled 
                        ? 'bg-white border-slate-200 hover:shadow-md hover:border-blue-300' 
                        : 'bg-slate-50/80 border-slate-200'}`}
                 >
                   <div className="flex items-start justify-between gap-3">
                      <div className={`flex items-start gap-3 flex-1 ${!rule.enabled ? 'opacity-50' : ''}`}>
                          <div className={`mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold shrink-0
                            ${rule.enabled ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                            {startIndex + index + 1}
                          </div>
                          <span className={`text-base leading-relaxed break-words font-medium ${rule.enabled ? 'text-slate-700' : 'text-slate-500 line-through decoration-slate-300'}`}>
                            {rule.text}
                          </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-1">
                          <button
                            onClick={() => toggleRule(rule.id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 
                              ${rule.enabled ? 'bg-blue-600' : 'bg-slate-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${rule.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                           <button onClick={() => removeRule(rule.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                             <X className="w-5 h-5" />
                           </button>
                      </div>
                   </div>
                   <div className={`pl-9 ${!rule.enabled ? 'opacity-50' : ''}`}>
                     {getCategoryBadge(rule.category)}
                   </div>
                 </li>
               ))}
               {rules.length === 0 && (
                 <li className="text-center py-12 text-slate-400 text-base italic">暂无规则，请在上方添加或导入</li>
               )}
             </ul>
          </div>
          
          {/* 规则分页器 */}
          {rules.length > 0 && (
            <div className="p-4 border-t border-slate-200 bg-white shrink-0 flex items-center justify-between">
              <button onClick={goToPrevious} disabled={currentPage === 1} className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium text-slate-600">第 {currentPage} 页 / 共 {totalPages} 页</span>
              <button onClick={goToNext} disabled={currentPage === totalPages} className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* 主内容区域：文件上传与列表 */}
        <div className="flex-1 overflow-y-auto p-10 bg-sky-50/50">
          
          {/* 上传区域 (支持拖拽) */}
          <div className="mb-10 w-full">
            <label 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`group flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-2xl cursor-pointer bg-white transition-all duration-300 hover:shadow-lg
                    ${isDragOver 
                        ? 'border-blue-500 bg-blue-50 scale-[1.01] shadow-blue-200' 
                        : 'border-blue-300 hover:border-blue-400 hover:bg-blue-50 hover:shadow-blue-100'}`}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full transition-colors ${isDragOver ? 'bg-blue-200' : 'bg-blue-100 group-hover:bg-blue-200'}`}>
                        <Upload className="w-8 h-8 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-lg text-slate-700 font-bold">点击或拖拽上传报告文档</p>
                        <p className="text-sm text-slate-400 mt-1">支持 .DOCX 格式</p>
                    </div>
                </div>
              </div>
              <input type="file" className="hidden" multiple accept=".docx" onChange={handleFileUpload} />
            </label>
          </div>

          {/* 文件卡片列表 */}
          <div className="space-y-8 w-full pb-24">
            {files.length === 0 && (
               <div className="text-center py-16 text-slate-300">
                 <FileText className="w-20 h-20 mx-auto mb-6 opacity-50" />
                 <p className="text-xl font-medium">暂无文件</p>
               </div>
            )}

            {files.map((file) => {
              const hasIssues = file.auditResult && file.auditResult.issues.length > 0;
              const isPassed = file.auditResult?.status === AuditStatus.PASS;

              return (
                <div 
                  key={file.id} 
                  className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all
                    ${file.auditResult?.status === AuditStatus.FAIL ? 'border-red-200 shadow-red-50' : 
                      file.auditResult?.status === AuditStatus.WARNING ? 'border-amber-200 shadow-amber-50' : 
                      'border-slate-200'}
                  `}
                >
                  {/* 文件卡片头部 */}
                  <div className="flex items-center justify-between p-6 bg-white z-10 relative">
                    <div className="flex items-center gap-5 flex-1 min-w-0">
                      <div className={`p-3 rounded-xl shadow-sm ${file.auditResult ? 'bg-white' : 'bg-slate-100'}`}>
                        {getStatusIcon(file.isProcessing ? AuditStatus.PROCESSING : file.auditResult?.status)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-800 truncate text-lg">{file.file.name}</h3>
                        <div className="flex items-center gap-4 mt-1">
                          <p className="text-sm font-medium text-slate-400 bg-slate-50 px-2.5 py-0.5 rounded">{(file.file.size / 1024).toFixed(1)} KB</p>
                          {file.auditResult && (
                            <span className="text-sm text-slate-400">处理完成</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 操作按钮组 */}
                    <div className="flex items-center gap-4">
                      {/* 如果有问题，显示问题数量徽章 */}
                      {file.auditResult && !isPassed && (
                         <div className="flex items-center gap-2 mr-3">
                             <span className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                                {file.auditResult.issues.length} 个问题
                             </span>
                         </div>
                      )}

                      {/* 展开/收起详情按钮 */}
                      {file.auditResult && !isPassed && (
                          <button 
                            onClick={() => toggleExpand(file.id)}
                            className="text-base flex items-center gap-1.5 text-blue-600 font-semibold px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            {expandedFiles.has(file.id) ? '收起详情' : '查看详情'}
                            {expandedFiles.has(file.id) ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
                          </button>
                      )}
                      
                      {/* 另存为按钮 */}
                      <button 
                          onClick={() => openLocalFile(file.file)}
                          className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="另存为 (并在本地打开)"
                        >
                          <FileOutput className="w-5 h-5" />
                      </button>

                      {/* 预览按钮 */}
                      <button 
                        onClick={async () => {
                           // 确保有内容可预览
                           if (!file.content) {
                               try {
                                   const content = await extractContentFromDocx(file.file);
                                   const updatedFile = { ...file, content };
                                   setFiles(prev => prev.map(f => f.id === file.id ? updatedFile : f));
                                   setPreviewFile(updatedFile);
                               } catch (e) {
                                   alert("无法预览文件");
                               }
                           } else {
                               setPreviewFile(file);
                           }
                        }}
                        className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="预览文档"
                      >
                        <Eye className="w-5 h-5" />
                      </button>

                      {/* 查看摘要弹窗按钮 */}
                      {file.auditResult && (
                        <button 
                          onClick={() => setSelectedFile(file)}
                          className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="查看完整报告摘要"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                      )}

                      {/* CSV 导出按钮 */}
                      {file.auditResult && (
                        <button 
                          onClick={() => exportToCSV(file)}
                          className="p-2.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="导出 CSV 报告"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      )}

                      {/* 删除文件按钮 */}
                      <button 
                        onClick={() => removeFile(file.id)}
                        className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="移除文件"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* 内联问题详情列表 (展开时显示) */}
                  {file.auditResult && hasIssues && expandedFiles.has(file.id) && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-8 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-3 mb-6">
                            <AlertTriangle className="w-5 h-5 text-slate-500" />
                            <h4 className="font-bold text-slate-700 text-base uppercase tracking-wide">审核发现错误项</h4>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                            <table className="w-full text-left text-base">
                                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4 w-1/4">错误分类</th>
                                        <th className="px-6 py-4 w-1/2">具体错误描述</th>
                                        <th className="px-6 py-4 w-1/4">严重程度</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {file.auditResult.issues.map((issue, idx) => (
                                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="px-6 py-4 align-top">
                                                {getCategoryBadge(issue.category)}
                                                <div className="text-slate-400 font-mono text-xs mt-2">{issue.location || "全局/未知位置"}</div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-700 align-top leading-relaxed">
                                                <div className="font-medium mb-1.5 text-slate-900 text-lg">{issue.rule}</div>
                                                <div className="text-slate-600 text-sm">{issue.description}</div>
                                            </td>
                                            <td className="px-6 py-4 align-top">{getSeverityBadge(issue.severity)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                  )}

                  {/* 通过审核时的提示 */}
                  {file.auditResult && isPassed && (
                      <div className="border-t border-slate-100 bg-green-50/30 p-4 text-center">
                          <p className="text-green-700 text-base font-medium flex items-center justify-center gap-2.5">
                              <CheckCircle className="w-5 h-5" /> 文档符合所有预设规则，未发现异常。
                          </p>
                      </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 全局弹窗组件 */}
      {selectedFile && <ReportModal file={selectedFile} onClose={() => setSelectedFile(null)} />}
      {previewFile && <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
};

export default Dashboard;