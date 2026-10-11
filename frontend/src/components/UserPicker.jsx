import { useEffect, useState } from 'react';
import api from '../api/axios';
import './UserPicker.css';

// Search for people and select several of them.
// `selected` is an array of { id, name, avatar }, and `excludeIds` hides people
// who shouldn't be offered (for example, existing group members).
export default function UserPicker({ selected, onChange, excludeIds = [] }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Search 400ms after the user stops typing
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/users/search', { params: { q } });
        setResults(data.users);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const showResults = query.trim().length >= 2;
  const visible = results.filter((u) => !excludeIds.includes(u.id));
  const isSelected = (id) => selected.some((u) => u.id === id);

  const toggle = (user) =>
    onChange(isSelected(user.id) ? selected.filter((u) => u.id !== user.id) : [...selected, user]);

  return (
    <div className="picker">
      {selected.length > 0 && (
        <div className="picker-chips">
          {selected.map((u) => (
            <button key={u.id} type="button" className="picker-chip" onClick={() => toggle(u)}>
              {u.name} ✕
            </button>
          ))}
        </div>
      )}

      <input
        className="picker-search"
        placeholder="Search people by name or exact email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {showResults && (
        <div className="picker-results">
          {searching && <p className="picker-note">Searching...</p>}
          {!searching && visible.length === 0 && <p className="picker-note">No users found</p>}
          {visible.map((u) => (
            <button key={u.id} type="button" className="picker-item" onClick={() => toggle(u)}>
              <span>{u.name}</span>
              {isSelected(u.id) && <span className="picker-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}