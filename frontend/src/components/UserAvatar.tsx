interface UserAvatarProps {
  avatar?: string | null;
  name?: string | null;
  sizeClassName?: string;
  textClassName?: string;
  className?: string;
}

const getInitial = (name?: string | null): string => {
  const value = name?.trim();
  if (!value) {
    return '我';
  }
  return value[0].toUpperCase();
};

function UserAvatar({
  avatar,
  name,
  sizeClassName = 'h-10 w-10',
  textClassName = 'text-sm',
  className = '',
}: UserAvatarProps) {
  const initial = getInitial(name);

  return (
    <div
      className={`overflow-hidden rounded-full bg-[#EEEDFE] ${sizeClassName} ${className}`.trim()}
    >
      {avatar ? (
        <img src={avatar} alt={name ?? '用户头像'} className="h-full w-full object-cover" />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center font-semibold text-[#534AB7] ${textClassName}`.trim()}
        >
          {initial}
        </div>
      )}
    </div>
  );
}

export default UserAvatar;
