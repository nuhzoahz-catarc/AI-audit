import React from 'react';
import { DocFile } from '../types';
import { X, FileText } from 'lucide-react';

interface Props {
  file: DocFile;
  onClose: () => void;
}

const PreviewModal: React.FC<Props> = ({ file, onClose }) => {
  return (
    // 预览模态框全屏遮罩
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        
        {/* 头部：显示文件名 */}
        <div className="bg-slate-800 text-white p-4 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
             <div className="bg-white/10 p-2 rounded-lg">
                <FileText className="w-5 h-5" />
             </div>
             <div>
                <h2 className="text-lg font-bold truncate max-w-md">{file.file.name}</h2>
                <p className="text-xs text-slate-300">文档预览</p>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-100">
          {/* 模拟 A4 纸张效果的容器 */}
          <div className="bg-white shadow-sm p-10 min-h-full max-w-[210mm] mx-auto rounded-sm border border-slate-200 text-slate-900 leading-relaxed word-document-preview">
            {/* 
              直接插入 HTML 内容。
              注意：这里的 content 是由 mammoth 本地转换生成的，相对安全。
              但在生产环境中，建议使用 DOMPurify 等库进行消毒，防止 XSS 攻击。
            */}
            <div 
                dangerouslySetInnerHTML={{ __html: file.content || "<p class='text-center text-gray-400 italic'>内容解析中或为空...</p>" }} 
                className="prose prose-slate max-w-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;