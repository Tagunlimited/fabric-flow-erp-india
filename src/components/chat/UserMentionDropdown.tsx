import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface User {
  user_id: string;
  full_name: string;
  avatar_url?: string;
}

interface UserMentionDropdownProps {
  searchTerm: string;
  onSelect: (user: User) => void;
  position: { top: number; left: number };
  onClose: () => void;
}

export function UserMentionDropdown({
  searchTerm,
  onSelect,
  position,
  onClose,
}: UserMentionDropdownProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        // Include all approved users AND all admins (so everyone can tag admins)
        let query = supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .or('status.eq.approved,role.eq.admin');

        // If search term exists, filter by it, otherwise show all
        if (searchTerm.trim()) {
          query = query.ilike('full_name', `%${searchTerm}%`);
        }

        const { data, error } = await query
          .order('full_name', { ascending: true })
          .limit(20);

        if (error) throw error;
        setUsers(data || []);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Error fetching users:', error);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchUsers, 200);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, users.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (users[selectedIndex]) {
          onSelect(users[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [users, selectedIndex, onSelect, onClose]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      className="fixed z-[100] w-64 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      {loading ? (
        <div className="p-2 text-sm text-muted-foreground">Loading...</div>
      ) : users.length === 0 ? (
        <div className="p-2 text-sm text-muted-foreground">No users found</div>
      ) : (
        <div className="p-1">
          {users.map((user, index) => (
            <div
              key={user.user_id}
              className={cn(
                'flex items-center gap-2 p-2 rounded-sm cursor-pointer hover:bg-accent',
                selectedIndex === index && 'bg-accent'
              )}
              onClick={() => onSelect(user)}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatar_url} alt={user.full_name} />
                <AvatarFallback>{getInitials(user.full_name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{user.full_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

