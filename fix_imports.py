import sys

with open('src/App.tsx', 'r', encoding='utf8') as f:
    app = f.read()

# Replace imports
old_import = "import { jsPDF } from 'jspdf';"
new_import = "import { useReactToPrint } from 'react-to-print';\nimport { PrintableExamView } from './components/PrintableExamView';"
app = app.replace(old_import, new_import)

# Insert refs inside function App() {
hook_target = "export default function App() {"
hook_inject = '''export default function App() {
  // ── Print State ──
  const printRef = useRef<HTMLDivElement>(null);
  const [printingExam, setPrintingExam] = useState<Exam | null>(null);

  const handlePrintParams = useReactToPrint({
    contentRef: printRef,
    documentTitle: printingExam ? De_Thi_ : 'De_Thi',
    onAfterPrint: () => setPrintingExam(null),
  });

  useEffect(() => {
    if (printingExam && printRef.current) {
      handlePrintParams();
    }
  }, [printingExam, handlePrintParams]);
'''
app = app.replace(hook_target, hook_inject)

with open('src/App.tsx', 'w', encoding='utf8') as f:
    f.write(app)
