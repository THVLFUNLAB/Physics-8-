/**
 * ═══════════════════════════════════════════════════════════════
 *  SearchableYCCDDropdown — Searchable Dropdown cho YCCĐ
 *  Premium UI: Dark theme, glassmorphism, keyboard navigation
 * ═══════════════════════════════════════════════════════════════
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { YCCD_LIST, getYCCDByCode, type YCCD } from '../../data/yccdData';
import { Search, X, ChevronDown, GraduationCap, CheckCircle2 } from 'lucide-react';

interface Props {
  value: string | undefined;       // yccdCode hiện tại
  onChange: (code: string) => void; // callback khi chọn
  className?: string;
}

export const SearchableYCCDDropdown: React.FC<Props> = ({ value, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Lọc YCCĐ theo từ khóa ──
  const filtered = useMemo(() => {
    if (!search.trim()) return YCCD_LIST;
    const needle = search.toLowerCase().trim();
    return YCCD_LIST.filter(y =>
      y.content.toLowerCase().includes(needle) ||
      y.topic.toLowerCase().includes(needle) ||
      y.grade.toLowerCase().includes(needle) ||
      y.code.toLowerCase().includes(needle) ||
      y.keywords.some(k => k.includes(needle))
    );
  }, [search]);

  // ── Group theo Grade ──
  const grouped = useMemo(() => {
    const map = new Map<string, YCCD[]>();
    for (const item of filtered) {
      const arr = map.get(item.grade) || [];
      arr.push(item);
      map.set(item.grade, arr);
    }
    return map;
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => filtered, [filtered]);

  // ── Close on click outside ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Keyboard navigation ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => Math.min(prev + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatList[highlightedIndex]) {
          onChange(flatList[highlightedIndex].code);
          setIsOpen(false);
          setSearch('');
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearch('');
        break;
    }
  };

  // ── Scroll highlighted item into view ──
  useEffect(() => {
    if (isOpen && listRef.current) {
      const item = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  // Reset highlight when search changes
  useEffect(() => { setHighlightedIndex(0); }, [search]);

  // ── Selected item display ──
  const selectedItem = value ? getYCCDByCode(value) : null;

  const gradeColors: Record<string, string> = {
    '10': 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
    '11': 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    '12': 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    'Chuyên đề 12.1': 'bg-fuchsia-600/20 text-fuchsia-400 border-fuchsia-600/30',
    'Chuyên đề 12.2': 'bg-rose-600/20 text-rose-400 border-rose-600/30',
    'Chuyên đề 12.3': 'bg-violet-600/20 text-violet-400 border-violet-600/30',
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)} onKeyDown={handleKeyDown}>
      {/* ── Trigger Button ── */}
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all text-sm",
          isOpen
            ? "bg-slate-800 border-cyan-500/50 ring-2 ring-cyan-500/20"
            : "bg-slate-900 border-slate-700 hover:border-slate-500",
          selectedItem ? "text-white" : "text-slate-500"
        )}
      >
        <GraduationCap className="w-4 h-4 text-cyan-400 shrink-0" />
        <span className="flex-1 truncate">
          {selectedItem ? (
            <span className="flex items-center gap-2">
              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border", gradeColors[selectedItem.grade] || 'bg-slate-700 text-slate-300')}>
                Lớp {selectedItem.grade}
              </span>
              <span className="text-[11px] font-medium truncate">{selectedItem.content.substring(0, 60)}...</span>
            </span>
          ) : (
            'Chọn Yêu cầu cần đạt (YCCĐ)...'
          )}
        </span>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="p-1 hover:bg-red-600/20 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={cn("w-4 h-4 text-slate-500 transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* ── Dropdown Panel ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-2 w-full bg-slate-900/98 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
          >
            {/* Search Input */}
            <div className="p-3 border-b border-slate-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Gõ từ khóa: dao động, điện trường, hạt nhân..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-600 mt-2 px-1">
                {filtered.length} / {YCCD_LIST.length} YCCĐ — Dùng ↑↓ Enter để chọn
              </p>
            </div>

            {/* Results List */}
            <div ref={listRef} className="max-h-[320px] overflow-y-auto custom-scrollbar">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">
                  Không tìm thấy YCCĐ phù hợp.
                </div>
              ) : (
                Array.from(grouped).map(([grade, items]) => (
                  <div key={grade}>
                    <div className="sticky top-0 z-10 px-4 py-2 bg-slate-950/90 backdrop-blur-sm border-b border-slate-800/50">
                      <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border", gradeColors[grade] || 'bg-slate-700 text-slate-300')}>
                        Lớp {grade} — {items[0].topic}
                      </span>
                    </div>
                    {items.map((item) => {
                      const globalIdx = flatList.indexOf(item);
                      const isHighlighted = globalIdx === highlightedIndex;
                      const isSelected = value === item.code;

                      return (
                        <button
                          key={item.code}
                          type="button"
                          data-index={globalIdx}
                          onClick={() => {
                            onChange(item.code);
                            setIsOpen(false);
                            setSearch('');
                          }}
                          onMouseEnter={() => setHighlightedIndex(globalIdx)}
                          className={cn(
                            "w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-b border-slate-800/30",
                            isHighlighted ? "bg-cyan-600/10" : "hover:bg-slate-800/50",
                            isSelected && "bg-cyan-600/5"
                          )}
                        >
                          {isSelected ? (
                            <CheckCircle2 className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                          ) : (
                            <span className="w-4 h-4 rounded-full border border-slate-700 mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[9px] font-bold text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">{item.code}</span>
                              <span className="text-[10px] font-bold text-cyan-500">{item.topic}</span>
                            </div>
                            <p className={cn(
                              "text-[11px] leading-relaxed line-clamp-2",
                              isSelected ? "text-cyan-300 font-medium" : "text-slate-400"
                            )}>
                              {item.content}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchableYCCDDropdown;
