// Test Bible Reference Detection for Search Function
const CHINESE_BOOK_MAP = {
    '创世记': 'GEN',
    '出埃及记': 'EXO',
    '诗篇': 'PSA',
    '箴言': 'PRO',
    '马太福音': 'MAT',
    '约翰福音': 'JHN',
    '罗马书': 'ROM',
    '启示录': 'REV',
};

const BIBLE_BOOKS = [
    { id: 'GEN', name: '创世记 Genesis', chapters: 50 },
    { id: 'PSA', name: '诗篇 Psalms', chapters: 150 },
    { id: 'MAT', name: '马太福音 Matthew', chapters: 28 },
    { id: 'JHN', name: '约翰福音 John', chapters: 21 },
    { id: 'ROM', name: '罗马书 Romans', chapters: 16 },
];

const parseBibleReference = (text) => {
    // Try to parse as Chinese reference
    const chineseBookNames = Object.keys(CHINESE_BOOK_MAP).join('|');
    const chinesePattern = new RegExp(`(${chineseBookNames})\\s*(\\d+):(\\d+)(?:-(\\d+))?`);
    const chineseMatch = text.match(chinesePattern);
    
    if (chineseMatch) {
        const bookName = chineseMatch[1];
        const chapter = parseInt(chineseMatch[2]);
        const verseStart = parseInt(chineseMatch[3]);
        const verseEnd = chineseMatch[4] ? parseInt(chineseMatch[4]) : undefined;
        
        const bookId = CHINESE_BOOK_MAP[bookName];
        if (!bookId) return null;
        
        const verses = [];
        if (verseEnd) {
            for (let v = verseStart; v <= verseEnd; v++) {
                verses.push(v);
            }
        } else {
            verses.push(verseStart);
        }
        
        return { bookId, chapter, verses };
    }
    
    // Try to parse as English reference
    const englishBookNames = BIBLE_BOOKS.map(b => {
        const parts = b.name.split(' ');
        return parts.slice(1).join(' ');
    }).join('|');
    const bookPattern = `(${englishBookNames})`;
    
    const refPattern = new RegExp(`${bookPattern}\\s+(\\d+):(\\d+)(?:-(\\d+))?`, 'i');
    const match = text.match(refPattern);
    
    if (match) {
        const bookName = match[1];
        const chapter = parseInt(match[2]);
        const verseStart = parseInt(match[3]);
        const verseEnd = match[4] ? parseInt(match[4]) : undefined;
        
        const book = BIBLE_BOOKS.find(b => {
            const parts = b.name.split(' ');
            const englishName = parts.slice(1).join(' ');
            return englishName.toLowerCase() === bookName.toLowerCase();
        });
        if (!book) return null;
        
        const verses = [];
        if (verseEnd) {
            for (let v = verseStart; v <= verseEnd; v++) {
                verses.push(v);
            }
        } else {
            verses.push(verseStart);
        }
        
        return { bookId: book.id, chapter, verses };
    }
    
    return null;
};

// Test cases for search bar
const testCases = [
    // Chinese references
    { input: '诗篇95:11', expected: { bookId: 'PSA', chapter: 95, verses: [11] }, description: 'Chinese: 诗篇95:11' },
    { input: '创世记1:1', expected: { bookId: 'GEN', chapter: 1, verses: [1] }, description: 'Chinese: 创世记1:1' },
    { input: '约翰福音3:16', expected: { bookId: 'JHN', chapter: 3, verses: [16] }, description: 'Chinese: 约翰福音3:16' },
    { input: '罗马书8:28', expected: { bookId: 'ROM', chapter: 8, verses: [28] }, description: 'Chinese: 罗马书8:28' },
    { input: '诗篇 23:1', expected: { bookId: 'PSA', chapter: 23, verses: [1] }, description: 'Chinese with space: 诗篇 23:1' },
    { input: '马太福音5:3-10', expected: { bookId: 'MAT', chapter: 5, verses: [3,4,5,6,7,8,9,10] }, description: 'Chinese range: 马太福音5:3-10' },
    
    // English references
    { input: 'Psalms 95:11', expected: { bookId: 'PSA', chapter: 95, verses: [11] }, description: 'English: Psalms 95:11' },
    { input: 'Genesis 1:1', expected: { bookId: 'GEN', chapter: 1, verses: [1] }, description: 'English: Genesis 1:1' },
    { input: 'John 3:16', expected: { bookId: 'JHN', chapter: 3, verses: [16] }, description: 'English: John 3:16' },
    { input: 'Romans 8:28', expected: { bookId: 'ROM', chapter: 8, verses: [28] }, description: 'English: Romans 8:28' },
    
    // Should NOT match (text searches)
    { input: '爱', expected: null, description: 'Text search: 爱' },
    { input: 'love', expected: null, description: 'Text search: love' },
    { input: 'faith hope love', expected: null, description: 'Text search: faith hope love' },
];

console.log('Testing Search Bar Bible Reference Detection:\n');
console.log('=' .repeat(80));

let passCount = 0;
let failCount = 0;

testCases.forEach(({ input, expected, description }) => {
    const result = parseBibleReference(input);
    
    let passed = false;
    if (expected === null) {
        // Should not match
        passed = result === null;
    } else {
        // Should match
        passed = result && 
            result.bookId === expected.bookId && 
            result.chapter === expected.chapter &&
            JSON.stringify(result.verses) === JSON.stringify(expected.verses);
    }
    
    if (passed) {
        console.log(`✅ PASS: ${description}`);
        if (result) {
            console.log(`   → Navigate to: ${result.bookId} ${result.chapter}:${result.verses.join(',')}`);
        } else {
            console.log(`   → Text search: "${input}"`);
        }
        passCount++;
    } else {
        console.log(`❌ FAIL: ${description}`);
        console.log(`   Input: "${input}"`);
        console.log(`   Expected:`, expected);
        console.log(`   Got:`, result);
        failCount++;
    }
    console.log('-'.repeat(80));
});

console.log(`\nSummary: ${passCount} passed, ${failCount} failed`);

if (failCount > 0) {
    console.log('\n⚠️  Some tests failed! Please review the implementation.');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed! Search bar should now recognize Bible references.');
    process.exit(0);
}
