import * as XLSX from 'xlsx'; // 引入 xlsx 库，用于处理 Excel 文件读写
import { RuleConfig, RuleCategory } from '../types';

// Excel 中文分类名称到代码枚举的映射表
const CATEGORY_REVERSE_MAP: Record<string, RuleCategory> = {
  '文本编辑': 'text_editing',
  '流转逻辑': 'workflow_logic',
  '结果判定': 'result_determination',
  '特殊规则': 'special_rules'
};

/**
 * 通用的文件保存函数。
 * 尝试使用现代浏览器的 "另存为" 对话框 (File System Access API)，
 * 如果不支持，则降级为传统的下载链接方式。
 */
export const saveFile = async (blob: Blob, filename: string, types: any[] = []) => {
  try {
    // 检查浏览器是否支持 showSaveFilePicker API
    // @ts-ignore - TS 定义可能尚未包含此新 API
    if (typeof window.showSaveFilePicker === 'function') {
      // @ts-ignore
      // 弹出系统原生的“另存为”对话框
      const handle = await window.showSaveFilePicker({
        suggestedName: filename, // 建议的文件名
        types: types.length > 0 ? types : [{
            description: 'All Files',
            accept: {'application/octet-stream': ['.*']}
        }]
      });
      // 创建可写流
      const writable = await handle.createWritable();
      // 写入 Blob 数据
      await writable.write(blob);
      // 关闭流，完成保存
      await writable.close();
      return;
    }
  } catch (err: any) {
    // 如果用户在对话框中点击了“取消”，浏览器会抛出 AbortError，忽略即可
    if (err.name !== 'AbortError') {
        console.error('Save file picker failed', err);
    } else {
        return; // 用户取消
    }
  }

  // 降级方案：对于不支持 showSaveFilePicker 的浏览器
  // 创建一个临时的 <a> 标签来触发下载
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click(); // 模拟点击
  document.body.removeChild(link); // 清理 DOM
  URL.revokeObjectURL(url); // 释放内存
};

// 解析上传的规则文件 (Excel/CSV)
export const parseRulesFile = async (file: File): Promise<RuleConfig[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        // 使用 xlsx 读取二进制数据
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0]; // 只读取第一个 Sheet
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 将 Sheet 转换为 JSON 数组 (二维数组格式)
        const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });

        if (jsonData.length < 2) {
            reject(new Error("文件内容为空或格式不正确。"));
            return;
        }

        // 验证表头 (第 0 行)
        const headers = jsonData[0];
        if (!headers || headers[0]?.trim() !== '规则类型' || headers[1]?.trim() !== '规则内容') {
            reject(new Error("表格格式错误。首行必须包含“规则类型”和“规则内容”两列。"));
            return;
        }

        const newRules: RuleConfig[] = [];
        
        // 处理数据行 (从第 1 行开始)
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length < 2) continue;

            const typeCN = row[0]?.trim();
            const text = row[1]?.trim();

            if (typeCN && text) {
                // 映射中文分类到英文枚举
                const category = CATEGORY_REVERSE_MAP[typeCN] || 'special_rules';
                newRules.push({
                    id: `import-${Date.now()}-${i}`, // 生成唯一 ID
                    category,
                    text,
                    enabled: true
                });
            }
        }

        if (newRules.length === 0) {
            reject(new Error("未在文件中找到有效的规则数据。"));
            return;
        }

        resolve(newRules);

      } catch (error) {
        console.error("Excel parse error:", error);
        reject(new Error("文件解析失败，请确保文件是有效的 .xlsx, .xls 或 .csv 格式。"));
      }
    };

    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsArrayBuffer(file);
  });
};

// 下载规则导入模板
export const downloadRuleTemplate = async () => {
    const headers = ["规则类型", "规则内容"];
    const examples = [
        ["文本编辑", "报告编号必须出现在页眉处"],
        ["结果判定", "检测结果数值不能为负数"],
        ["流转逻辑", "报告日期必须晚于检测结束日期"]
    ];
    
    // 创建 Sheet
    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "规则模板");
    
    // 生成 Excel 二进制数据
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // 触发另存为
    await saveFile(blob, "审批规则导入模板.xlsx", [{
        description: 'Excel File',
        accept: {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']}
    }]);
};

// 导出当前规则到 Excel
export const exportRulesToExcel = async (rules: RuleConfig[]) => {
    const headers = ["规则类型", "规则内容"];
    // 英文枚举到中文显示的映射
    const categoryMap: Record<string, string> = {
        'text_editing': '文本编辑',
        'workflow_logic': '流转逻辑',
        'result_determination': '结果判定',
        'special_rules': '特殊规则'
    };

    // 格式化数据
    const data = rules.map(r => [
        categoryMap[r.category] || '特殊规则',
        r.text
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "当前审批规则");
    
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const filename = `审批规则导出_${new Date().toISOString().split('T')[0]}.xlsx`;

    // 触发另存为
    await saveFile(blob, filename, [{
        description: 'Excel File',
        accept: {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']}
    }]);
};