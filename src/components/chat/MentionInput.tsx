import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { UserMentionDropdown } from './UserMentionDropdown';
import { OrderMentionDropdown } from './OrderMentionDropdown';
import { EmojiPicker } from './EmojiPicker';

interface User {
  user_id: string;
  full_name: string;
  avatar_url?: string;
}

interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name?: string;
}

interface MentionInputProps {
  onSend: (message: string, userMentions: string[], orderMentions: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MentionInput({ onSend, disabled, placeholder = 'Type a message...', onTyping }: MentionInputProps) {
  const [message, setMessage] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showOrderDropdown, setShowOrderDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getCaretPosition = useCallback(() => {
    if (!inputRef.current) return { top: 0, left: 0 };

    const input = inputRef.current;
    const rect = input.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 240; // max-h-60 = 240px

    // Check if there's enough space below, otherwise show above
    const spaceBelow = viewportHeight - rect.bottom;
    const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    // Use fixed positioning relative to viewport
    return {
      top: showAbove 
        ? rect.top + window.scrollY - dropdownHeight - 4
        : rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMessage(value);
    setCursorPosition(cursorPos);
    
    // Trigger typing indicator
    if (onTyping && value.trim()) {
      onTyping();
    }

    // Check for @ mention
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@#]*)$/);
    
    if (atMatch) {
      setMentionSearch(atMatch[1]);
      setShowUserDropdown(true);
      setShowOrderDropdown(false);
      // Update position after state update
      setTimeout(() => setMentionPosition(getCaretPosition()), 0);
    } else {
      // Check for # mention
      const hashMatch = textBeforeCursor.match(/#([^\s@#]*)$/);
      if (hashMatch) {
        setMentionSearch(hashMatch[1]);
        setShowUserDropdown(false);
        setShowOrderDropdown(true);
        // Update position after state update
        setTimeout(() => setMentionPosition(getCaretPosition()), 0);
      } else {
        setShowUserDropdown(false);
        setShowOrderDropdown(false);
      }
    }
  };

  // Update dropdown position when it's visible
  useEffect(() => {
    if (showUserDropdown || showOrderDropdown) {
      const updatePosition = () => {
        setMentionPosition(getCaretPosition());
      };
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [showUserDropdown, showOrderDropdown, getCaretPosition]);

  const insertMention = (mention: string, type: 'user' | 'order') => {
    if (!inputRef.current) return;

    const input = inputRef.current;
    const textBeforeCursor = message.slice(0, cursorPosition);
    const textAfterCursor = message.slice(cursorPosition);

    // Find the mention start position
    const mentionStart = type === 'user' 
      ? textBeforeCursor.lastIndexOf('@')
      : textBeforeCursor.lastIndexOf('#');

    if (mentionStart === -1) return;

    const newText = 
      message.slice(0, mentionStart) + 
      (type === 'user' ? '@' : '#') + mention + ' ' + 
      textAfterCursor;

    setMessage(newText);
    setShowUserDropdown(false);
    setShowOrderDropdown(false);
    setMentionSearch('');

    // Focus back on input and set cursor position
    setTimeout(() => {
      input.focus();
      const newCursorPos = mentionStart + mention.length + 2; // +2 for @/# and space
      input.setSelectionRange(newCursorPos, newCursorPos);
      setCursorPosition(newCursorPos);
    }, 0);
  };

  const handleUserSelect = (user: User) => {
    insertMention(user.full_name, 'user');
  };

  const handleOrderSelect = (order: Order) => {
    insertMention(order.order_number, 'order');
  };

  const handleSend = () => {
    if (!message.trim() || disabled) return;

    // Extract mentions from message
    const userMentions: string[] = [];
    const orderMentions: string[] = [];

    // Extract @mentions
    const userMentionRegex = /@([^\s@#]+)/g;
    let match;
    while ((match = userMentionRegex.exec(message)) !== null) {
      userMentions.push(match[1]);
    }

    // Extract #mentions
    const orderMentionRegex = /#([^\s@#]+)/g;
    while ((match = orderMentionRegex.exec(message)) !== null) {
      orderMentions.push(match[1]);
    }

    onSend(message.trim(), userMentions, orderMentions);
    setMessage('');
    setShowUserDropdown(false);
    setShowOrderDropdown(false);
    setMentionSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Don't interfere with dropdown navigation
    if (showUserDropdown || showOrderDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        return; // Let dropdown handle it
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      setShowUserDropdown(false);
      setShowOrderDropdown(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage((prev) => prev + emoji);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-1 p-2 border-t bg-background">
      <div className="flex-1 relative">
        <Input
          ref={inputRef}
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-2"
        />
        {showUserDropdown && (
          <UserMentionDropdown
            searchTerm={mentionSearch}
            onSelect={handleUserSelect}
            position={mentionPosition}
            onClose={() => setShowUserDropdown(false)}
          />
        )}
        {showOrderDropdown && (
          <OrderMentionDropdown
            searchTerm={mentionSearch}
            onSelect={handleOrderSelect}
            position={mentionPosition}
            onClose={() => setShowOrderDropdown(false)}
          />
        )}
      </div>
      <EmojiPicker onEmojiSelect={handleEmojiSelect} />
      <Button
        onClick={handleSend}
        disabled={!message.trim() || disabled}
        size="icon"
        className="shrink-0"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}

