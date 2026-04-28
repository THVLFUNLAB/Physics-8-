/* ═══════════════════════════════════════════════════════════════════
 *  MINDMAP MODULE — CUSTOM PHYSICS NODE (COLLAPSIBLE)
 *  Click to expand children, click again to collapse
 *  🔒 LOCAL ONLY — Độc quyền Thầy Hậu Vật lý
 * ═══════════════════════════════════════════════════════════════════ */

import React, { memo, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'motion/react';
import katex from 'katex';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { MindmapNodeType } from './types';
import { NODE_COLORS } from './types';
import { extractLatex } from './utils';

interface PhysicsNodeProps {
  id: string;
  data: {
    id: string;
    type: MindmapNodeType;
    label: string;
    math?: string;
    img_id?: string;
    img_url?: string;
    description?: string;
    colors: typeof NODE_COLORS['root'];
    hasChildren: boolean;
    isExpanded: boolean;
    childCount: number;
  };
  selected?: boolean;
}

// ── KaTeX inline renderer ─────────────────────────────────────────
const InlineMath: React.FC<{ tex: string }> = ({ tex }) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        throwOnError: false,
        displayMode: false,
        output: 'html',
      });
    } catch {
      return `<span style="color:#ef4444">[Lỗi]</span>`;
    }
  }, [tex]);

  return (
    <span
      className="mindmap-katex-inline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

// ── Label with mixed text/math rendering ──────────────────────────
const SmartLabel: React.FC<{ text: string }> = ({ text }) => {
  const segments = useMemo(() => extractLatex(text), [text]);
  return (
    <span className="inline leading-relaxed">
      {segments.map((seg, i) =>
        seg.type === 'math' ? (
          <InlineMath key={i} tex={seg.content} />
        ) : (
          <span key={i}>{seg.content}</span>
        )
      )}
    </span>
  );
};

// ── Main Physics Node Component ───────────────────────────────────
const PhysicsNode: React.FC<PhysicsNodeProps> = ({ id, data, selected }) => {
  const isRoot = data.type === 'root';
  const colors = data.colors || NODE_COLORS[data.type];
  const { hasChildren, isExpanded, childCount } = data;

  // Detect warning notes
  const isWarning = data.type === 'note' && data.label.includes('⚠️');
  const displayIcon = isWarning ? '⚠️' : colors.icon;
  const nodeBg = isRoot ? colors.bg : (data.type === 'formula' ? '#fffdf7' : '#ffffff');

  // ── KaTeX block render ──
  const mathHtml = useMemo(() => {
    if (!data.math) return null;
    const cleanMath = data.math.replace(/^\$+|\$+$/g, '');
    try {
      return katex.renderToString(cleanMath, {
        throwOnError: false,
        displayMode: true,
        output: 'html',
      });
    } catch {
      return null;
    }
  }, [data.math]);

  return (
    <>
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            background: colors.border,
            border: '2px solid #ffffff',
            width: 10,
            height: 10,
            marginLeft: -2,
          }}
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: colors.border,
          border: '2px solid #ffffff',
          width: 10,
          height: 10,
          marginRight: -2,
          opacity: hasChildren ? 1 : 0,
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        whileHover={{ scale: 1.02, transition: { duration: 0.15 } }}
        whileTap={{ scale: 0.98 }}
        className="mindmap-physics-node group"
        style={{
          background: nodeBg,
          border: isRoot ? `2px solid rgba(255,255,255,0.2)` : `1px solid rgba(0,0,0,0.08)`,
          borderLeft: isRoot ? `2px solid rgba(255,255,255,0.2)` : `6px solid ${colors.border}`,
          borderRadius: isRoot ? 32 : 20,
          padding: isRoot ? '18px 32px' : '16px 24px',
          cursor: hasChildren ? 'pointer' : 'default',
          maxWidth: isRoot ? 360 : 340,
          minWidth: isRoot ? 200 : 160,
          boxShadow: isExpanded
            ? `0 0 0 4px ${colors.border}20, 0 16px 40px -8px ${colors.glow}`
            : selected
            ? `0 12px 32px -8px ${colors.glow}`
            : isRoot
            ? `0 12px 32px -8px ${colors.glow}`
            : `0 4px 20px -2px rgba(0,0,0,0.06)`,
          position: 'relative',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {/* Type icon badge */}
        <div
          style={{
            position: 'absolute',
            top: -12,
            right: -12,
            fontSize: isRoot ? 16 : 14,
            background: isRoot ? 'rgba(255,255,255,0.2)' : '#ffffff',
            backdropFilter: 'blur(10px)',
            borderRadius: '50%',
            width: isRoot ? 36 : 30,
            height: isRoot ? 36 : 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: isRoot ? '1px solid rgba(255,255,255,0.5)' : `2px solid ${colors.border}40`,
            boxShadow: `0 4px 12px rgba(0,0,0,0.08)`,
            zIndex: 10,
          }}
        >
          {displayIcon}
        </div>

        {/* Expand/Collapse indicator — right edge */}
        {hasChildren && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              right: -14,
              transform: 'translateY(-50%)',
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: isExpanded ? colors.border : '#ffffff',
              border: `2px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'all 0.25s ease',
              zIndex: 10,
            }}
          >
            {isExpanded ? (
              <ChevronDown size={14} color="#ffffff" strokeWidth={3} />
            ) : (
              <ChevronRight size={14} color={colors.border} strokeWidth={3} />
            )}
          </div>
        )}

        {/* Child count badge (when collapsed) */}
        {hasChildren && !isExpanded && childCount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: -8,
              left: -8,
              fontSize: 10,
              fontWeight: 900,
              background: colors.border,
              color: '#ffffff',
              borderRadius: 10,
              padding: '2px 6px',
              minWidth: 22,
              textAlign: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              fontFamily: '"Inter", sans-serif',
              zIndex: 10,
            }}
          >
            +{childCount}
          </div>
        )}

        {/* Label (Title) */}
        <div
          style={{
            color: colors.text,
            fontWeight: isRoot ? 900 : 700,
            fontSize: isRoot ? 17 : 14,
            fontFamily: isRoot ? '"Outfit", sans-serif' : '"Plus Jakarta Sans", "Inter", sans-serif',
            letterSpacing: isRoot ? '-0.03em' : '-0.01em',
            textAlign: 'center',
            lineHeight: 1.4,
            marginBottom: data.description || mathHtml || data.img_id ? 8 : 0,
          }}
        >
          <SmartLabel text={data.label} />
        </div>

        {/* Math formula block */}
        {mathHtml && (
          <div
            className="mindmap-katex-block"
            style={{
              marginTop: 6,
              padding: '10px 12px',
              background: isRoot ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.02)',
              borderRadius: 10,
              border: `1px solid ${colors.border}30`,
              overflowX: 'auto',
              overflowY: 'hidden',
              display: 'flex',
              justifyContent: 'center',
              maxWidth: '100%',
            }}
            dangerouslySetInnerHTML={{ __html: mathHtml }}
          />
        )}

        {/* Image */}
        {data.img_id && (
          <div
            style={{
              marginTop: 8,
              borderRadius: 10,
              border: `1.5px dashed ${colors.border}60`,
              background: 'rgba(0,0,0,0.02)',
              overflow: 'hidden',
              minHeight: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {data.img_url ? (
              <img
                src={data.img_url}
                alt={data.label}
                style={{
                  maxWidth: '100%',
                  maxHeight: 140,
                  objectFit: 'contain',
                  borderRadius: 8,
                  pointerEvents: 'none',
                }}
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
            ) : (
              <span style={{ color: '#94a3b8', fontSize: 11, padding: '12px 8px', textAlign: 'center', fontWeight: 600 }}>
                📷 {data.img_id}
              </span>
            )}
          </div>
        )}

        {/* Description (ALWAYS SHOWN if present, not just when expanded) */}
        {data.description && (
          <div
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: isRoot ? '1px solid rgba(255,255,255,0.2)' : `1px solid ${colors.border}20`,
              color: isRoot ? 'rgba(255,255,255,0.9)' : '#64748b',
              fontSize: 11,
              lineHeight: 1.5,
              textAlign: isRoot ? 'center' : 'left',
              fontWeight: 500,
            }}
          >
            <SmartLabel text={data.description} />
          </div>
        )}
      </motion.div>
    </>
  );
};

export default memo(PhysicsNode);
