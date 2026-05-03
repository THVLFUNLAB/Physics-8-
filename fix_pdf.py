import re

with open('src/App.tsx', 'r', encoding='utf8') as f:
    app = f.read()

# Remove exportExamToPDF entirely
# It starts at: const exportExamToPDF = async (exam: Exam) => {
# and ends right before: // ═══ STUDENT PDF EXPORT (Trừ 5 lượt) ═══
# Let's use regex to remove everything between them
pattern = re.compile(r'const exportExamToPDF = async \(exam: Exam\) => \{.*?(?=\s*// ═══ STUDENT PDF EXPORT)', re.DOTALL)
app = pattern.sub('', app)

# Now update executePdfDownload
old_execute = '''    try {
      toast.info('Đang xử lý tải PDF...');
      const success = await consumePdfDownloadAttempts(user.uid, examToDownload.id);
      if (success) {
        exportExamToPDF(examToDownload);
        toast.success('Đã tải PDF và trừ 5 lượt thành công!');
      }'''

new_execute = '''    try {
      toast.info('Đang chuẩn bị file in PDF...');
      const success = await consumePdfDownloadAttempts(user.uid, examToDownload.id);
      if (success) {
        setPrintingExam(examToDownload);
        toast.success('Đã mở giao diện in PDF và trừ 5 lượt thành công!');
      }'''

app = app.replace(old_execute, new_execute)

# Inject the hidden PrintableExamView right before </main> or at the end of the App return
# Let's find </AnimatePresence> or similar inside the return block.
# Even better, let's put it right before the last closing </div> inside the main return.
# I'll just append it right before the first occurrences of 
#       </main>

hidden_print = '''
      {/* ── HIDDEN PRINTABLE EXAM (STUDENT) ── */}
      <div className="hidden">
        {printingExam && <PrintableExamView ref={printRef} exam={printingExam} />}
      </div>
'''
app = app.replace('      </main>', hidden_print + '\n      </main>')

with open('src/App.tsx', 'w', encoding='utf8') as f:
    f.write(app)
print("Updated executePdfDownload and injected PrintableExamView")
