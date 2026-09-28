// 题型定义：题型标签正则、标签映射、中文名。
// 说明：迁移自旧单文件，现为唯一来源，可直接编辑。
    // 学习通题干通常带【题型】标签，这是最可靠的结构锚点（不随 class 命名变化）。
    export const TYPE_TAG_RE = /【\s*[^】]{1,8}\s*】/;
    // 标签文本 → 内部题型
    export const TYPE_LABELS = [
        [/单选/, 'single'],
        [/多选/, 'multiple'],
        [/判断/, 'judge'],
        [/完型填空|完形填空/, 'cloze'],
        [/填空/, 'fill'],
        [/名词解释/, 'term'],
        [/听力/, 'listening'],
        [/阅读|材料题?/, 'reading'],
        [/简答|计算|分析|案例/, 'short'],
        [/论述/, 'essay'],
        [/分录/, 'entry'],
        [/排序/, 'sort'],
        [/连线|匹配/, 'match'],
    ];
    // 内部题型 → 中文名（用于给 AI 的提示与日志）
    export const TYPE_NAMES = {
        single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题',
        cloze: '完型填空题', term: '名词解释', listening: '听力题', reading: '阅读理解',
        short: '简答题', essay: '论述题', entry: '分录题', sort: '排序题',
        match: '连线题', unknown: '未知题型',
    };
// 主观题（需要用文字作答，且答案可能含多个要点）
export const SUBJECTIVE_TYPES = ['short', 'essay', 'term', 'entry', 'fill', 'cloze'];
