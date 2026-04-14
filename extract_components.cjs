const fs = require('fs');
const path = require('path');

const appContent = fs.readFileSync(path.join(__dirname, 'src', 'App.tsx'), 'utf8');
const lines = appContent.split(/\r?\n/);

// ── Extract DigitizationDashboard (lines 233-1443, 0-indexed: 232-1442) ──
const digitLines = lines.slice(232, 1443);
const digitHeader = [
  `import React, { useState, useRef } from 'react';`,
  `import { motion, AnimatePresence } from 'motion/react';`,
  `import { cn } from '../lib/utils';`,
  `import { auth, db, collection, doc, addDoc, updateDoc, Timestamp, writeBatch } from '../firebase';`,
  `import { Question, Topic } from '../types';`,
  `import { digitizeDocument, digitizeFromPDF, normalizeQuestions } from '../services/geminiService';`,
  `import { parseAzotaExam, ParseError } from '../services/AzotaParser';`,
  `import { processDocxFile } from '../services/DocxReader';`,
  `import { sanitizeQuestion, stripLargeBase64, stripUndefined } from '../utils/sanitizers';`,
  `import { toast } from './Toast';`,
  `import MathRenderer from '../lib/MathRenderer';`,
  `import QuestionReviewBoard from './QuestionReviewBoard';`,
  `import * as mammoth from 'mammoth';`,
  `import {`,
  `  BrainCircuit, Settings, Download, BookOpen, CheckCircle2,`,
  `  AlertTriangle, X, Pencil, Eye, FileText`,
  `} from 'lucide-react';`,
  ``,
  `// ── Kiểu dữ liệu Summary Object cho báo cáo sau số hóa ──`,
  `interface DigitizationSummary {`,
  `  success: boolean;`,
  `  totalInserted: number;`,
  `  totalFailed: number;`,
  `  details: { part1: number; part2: number; part3: number };`,
  `  sourceFile: string;`,
  `  timestamp: Date;`,
  `  errorDetails: string[];`,
  `}`,
  ``,
].join('\n');

fs.writeFileSync(
  path.join(__dirname, 'src', 'components', 'DigitizationDashboard.tsx'),
  digitHeader + digitLines.join('\n') + '\n\nexport default DigitizationDashboard;\n',
  'utf8'
);
console.log('DigitizationDashboard: ' + digitLines.length + ' lines extracted');

// ── Extract QuestionBank (lines 1457-2739, 0-indexed: 1456-2738) ──
const qbLines = lines.slice(1456, 2739);
const qbHeader = [
  `import React, { useState, useEffect, useMemo, useRef } from 'react';`,
  `import { motion, AnimatePresence } from 'motion/react';`,
  `import { cn } from '../lib/utils';`,
  `import {`,
  `  db, collection, doc, getDocs, getDocsFromServer, deleteDoc, updateDoc,`,
  `  Timestamp, writeBatch, query, where, addDoc`,
  `} from '../firebase';`,
  `import { Question, Topic, Part } from '../types';`,
  `import { PHYSICS_TOPICS, matchesTopic } from '../utils/physicsTopics';`,
  `import { normalizeText } from '../utils/textUtils';`,
  `import { sanitizeQuestion } from '../utils/sanitizers';`,
  `import { toast } from './Toast';`,
  `import MathRenderer from '../lib/MathRenderer';`,
  `import { ReviewExam } from './ReviewExam';`,
  `import {`,
  `  BookOpen, Search, Filter, ChevronLeft, ChevronRight,`,
  `  X, Check, Pencil, Save, Download, AlertTriangle,`,
  `  CheckCircle2, XCircle, Star, ArrowRight, RotateCcw,`,
  `  ImagePlus, Flag, FileText, BrainCircuit, Eye`,
  `} from 'lucide-react';`,
  `import { jsPDF } from 'jspdf';`,
  `import html2canvas from 'html2canvas';`,
  ``,
].join('\n');

fs.writeFileSync(
  path.join(__dirname, 'src', 'components', 'QuestionBank.tsx'),
  qbHeader + qbLines.join('\n') + '\n\nexport default QuestionBank;\n',
  'utf8'
);
console.log('QuestionBank: ' + qbLines.length + ' lines extracted');

// ── Extract ExamGenerator (lines 2741-3177, 0-indexed: 2740-3176) ──
const egLines = lines.slice(2740, 3232);
const egHeader = [
  `import React, { useState, useEffect, useMemo, useRef } from 'react';`,
  `import { motion, AnimatePresence } from 'motion/react';`,
  `import { cn } from '../lib/utils';`,
  `import {`,
  `  db, auth, collection, doc, getDocs, addDoc, updateDoc,`,
  `  Timestamp, writeBatch, query, where`,
  `} from '../firebase';`,
  `import { Question, UserProfile, Topic, Part, Exam } from '../types';`,
  `import { PHYSICS_TOPICS, matchesTopic } from '../utils/physicsTopics';`,
  `import { sanitizeQuestion } from '../utils/sanitizers';`,
  `import { toast } from './Toast';`,
  `import MathRenderer from '../lib/MathRenderer';`,
  `import {`,
  `  BookOpen, Play, Target, Settings, BrainCircuit,`,
  `  ChevronRight, Check, X, Download, Filter,`,
  `  AlertTriangle, CheckCircle2, FileText, Save`,
  `} from 'lucide-react';`,
  `import { jsPDF } from 'jspdf';`,
  `import html2canvas from 'html2canvas';`,
  ``,
].join('\n');

fs.writeFileSync(
  path.join(__dirname, 'src', 'components', 'ExamGenerator.tsx'),
  egHeader + egLines.join('\n') + '\n\nexport default ExamGenerator;\n',
  'utf8'
);
console.log('ExamGenerator: ' + egLines.length + ' lines extracted');

console.log('\n✅ All components extracted successfully!');
