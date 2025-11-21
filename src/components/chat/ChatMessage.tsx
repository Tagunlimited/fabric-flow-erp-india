import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { highlightMentions, formatTimestamp } from '@/utils/chatUtils';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';

interface Reaction {
  emoji: string;
  count: number;
  userReacted: boolean;
  users: string[];
}

interface ChatMessageProps {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  message: string;
  userMentions: string[];
  orderMentions: string[];
  createdAt: string;
  currentUserId: string;
  isHighlighted?: boolean;
  messageRef?: React.RefObject<HTMLDivElement>;
  userToEmployeeMap?: Map<string, string>;
  orders?: Array<{ id: string; order_number: string; order_type?: string }>;
  profiles?: Array<{ user_id: string; full_name: string }>;
  reactions?: Reaction[];
  onReactionClick?: (messageId: string, emoji: string) => void;
}

export function ChatMessage({
  id,
  senderId,
  senderName,
  senderAvatar,
  message,
  userMentions,
  orderMentions,
  createdAt,
  currentUserId,
  isHighlighted = false,
  messageRef,
  userToEmployeeMap = new Map(),
  orders = [],
  profiles = [],
  reactions = [],
  onReactionClick,
}: ChatMessageProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const navigate = useNavigate();
  const isOwnMessage = senderId === currentUserId;

  // Build maps for mention lookups
  const orderNumberToIdMap = React.useMemo(() => {
    const map = new Map<string, { id: string; order_type?: string }>();
    orders.forEach(order => {
      map.set(order.order_number.toLowerCase(), { id: order.id, order_type: order.order_type });
    });
    return map;
  }, [orders]);

  // Build username to userId map from message text and profiles
  // This maps the username in the message (e.g., "John Doe") to the user_id
  const buildUsernameToUserIdMap = React.useMemo(() => {
    const map = new Map<string, string>();
    // Parse message to find @mentions and match them to user_ids
    const mentionRegex = /@([^\s@#]+)/g;
    let match;
    let mentionIndex = 0;
    
    while ((match = mentionRegex.exec(message)) !== null) {
      const username = match[1].toLowerCase();
      // Try to find matching profile by full name
      const matchingProfile = profiles.find(p => {
        const profileNameLower = p.full_name.toLowerCase();
        return profileNameLower === username ||
               profileNameLower.includes(username) ||
               username.includes(profileNameLower);
      });
      
      if (matchingProfile) {
        // Use the user_id from userMentions array if available, otherwise use profile user_id
        if (mentionIndex < userMentions.length) {
          map.set(username, userMentions[mentionIndex]);
          mentionIndex++;
        } else {
          map.set(username, matchingProfile.user_id);
        }
      }
    }
    
    return map;
  }, [message, profiles, userMentions]);

  const handleUserMentionClick = (username: string, userId: string) => {
    // Find employee ID from user_id
    const employeeId = userToEmployeeMap.get(userId);
    if (employeeId) {
      navigate(`/people/employees/${employeeId}`);
    } else {
      // If no employee found, we could show a message or try to find by other means
      console.log('Employee not found for user:', userId);
    }
  };

  const handleOrderMentionClick = (orderNumber: string, orderId: string) => {
    const orderInfo = orderNumberToIdMap.get(orderNumber.toLowerCase());
    if (orderInfo) {
      if (orderInfo.order_type === 'readymade') {
        navigate(`/orders/readymade/${orderInfo.id}`);
      } else {
        navigate(`/orders/${orderInfo.id}`);
      }
    }
  };

  const handleReactionClick = (emoji: string) => {
    if (!onReactionClick) return;
    onReactionClick(id, emoji);
    setShowReactionPicker(false);
  };

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
      ref={messageRef}
      className={cn(
        'flex gap-3 p-3 hover:bg-muted/50 transition-colors',
        isHighlighted && 'bg-primary/10 animate-pulse',
        isOwnMessage && 'flex-row-reverse'
      )}
      id={`message-${id}`}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={senderAvatar} alt={senderName} />
        <AvatarFallback>{getInitials(senderName)}</AvatarFallback>
      </Avatar>
      <div className={cn('flex-1 min-w-0', isOwnMessage && 'flex flex-col items-end')}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold">{senderName}</span>
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(createdAt)}
          </span>
        </div>
        <div
          className={cn(
            'text-sm break-words',
            isOwnMessage ? 'text-right' : 'text-left'
          )}
        >
          {highlightMentions(
            message, 
            userMentions, 
            orderMentions,
            handleUserMentionClick,
            handleOrderMentionClick,
            buildUsernameToUserIdMap,
            orderNumberToIdMap
          )}
        </div>
        
        {/* Reactions */}
        {reactions && reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {reactions.map((reaction, index) => (
              <Button
                key={`${reaction.emoji}-${index}`}
                variant={reaction.userReacted ? 'secondary' : 'outline'}
                size="sm"
                className={cn(
                  'h-6 px-2 text-xs',
                  reaction.userReacted && 'bg-primary/10 border-primary'
                )}
                onClick={() => {
                  if (onReactionClick) {
                    onReactionClick(id, reaction.emoji);
                  }
                }}
              >
                <span className="mr-1">{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </Button>
            ))}
          </div>
        )}
        
        {/* Add reaction button */}
        {onReactionClick && (
          <Popover open={showReactionPicker} onOpenChange={setShowReactionPicker}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground mt-1"
              >
                Add reaction
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <div className="p-3">
                <div className="grid grid-cols-8 gap-1">
                  {['👍', '❤️', '😂', '😮', '😢', '🙏', '👏', '🔥', '🎉', '🚀', '💯', '✨'].map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReactionClick(emoji)}
                      className="text-xl hover:bg-accent rounded p-1 transition-colors aspect-square flex items-center justify-center"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

