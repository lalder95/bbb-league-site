'use client';

export default function AdminToolModal({ isOpen, onClose, title, description, children, widthClass = 'max-w-6xl' }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000814]/85 p-4 backdrop-blur-sm">
      <div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[28px] border border-white/12 bg-[#031b2c] shadow-[0_24px_80px_rgba(0,0,0,0.5)] ${widthClass}`}>
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,75,31,0.18),rgba(255,255,255,0.02))] px-5 py-4 md:px-6">
          <div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            {description ? <p className="mt-1 text-sm text-white/65">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label={`Close ${title}`}
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 md:px-6 md:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
