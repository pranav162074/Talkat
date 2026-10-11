// "14:05" for today's messages, "12 Oct, 14:05" for older ones
export const formatTime = (iso) => {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return time;
  const day = date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
};

// 1536 -> "1.5 KB"
export const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};