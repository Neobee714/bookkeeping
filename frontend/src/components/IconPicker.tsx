interface IconPickerProps {
  selectedIcon: string;
  selectedColor: string;
  onSelectIcon: (icon: string) => void;
  onSelectColor: (color: string) => void;
}

const ICONS = [
  '🍜', '🍔', '🍕', '🍣', '🍰', '☕', '🍺', '🥤',
  '🚌', '🚗', '⛽', '✈️', '🚲', '🚇',
  '🛒', '👕', '🎮', '📱', '💊', '🏠',
  '💼', '💰', '🎁', '📈', '🏦', '💳',
  '📚', '🎬', '🎵', '⚽', '🐱', '🌸',
  '💡', '🔧', '📎', '🎯', '🔥', '⚡',
  '🤖', '💻', '🎓', '🏥', '🧸', '🎤',
  '💵', '🛍️', '🍿', '📌', '💕',
];

const COLORS = [
  '#FF6B6B', '#FF8E53', '#FFC93C', '#52C41A', '#36CFC9', '#4F6EF7',
  '#9B59B6', '#FF69B4', '#607D8B', '#795548', '#E91E63', '#00BCD4',
];

function IconPicker({
  selectedIcon,
  selectedColor,
  onSelectIcon,
  onSelectColor,
}: IconPickerProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs text-[#8E8E93]">图标</p>
        <div className="grid grid-cols-8 gap-2">
          {ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => onSelectIcon(icon)}
              className={`flex h-10 w-10 items-center justify-center rounded-[10px] border text-xl transition ${
                selectedIcon === icon
                  ? 'border-[#007AFF] bg-[rgba(0,122,255,0.08)]'
                  : 'border-[rgba(60,60,67,0.12)] bg-white'
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-[#8E8E93]">颜色</p>
        <div className="grid grid-cols-6 gap-2">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onSelectColor(color)}
              className={`flex h-10 w-10 items-center justify-center rounded-[10px] border-2 transition ${
                selectedColor === color
                  ? 'border-[#007AFF] scale-110'
                  : 'border-transparent'
              }`}
              style={{ background: color }}
            >
              {selectedColor === color && (
                <span className="text-sm text-white">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default IconPicker;
