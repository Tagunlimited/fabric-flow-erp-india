import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  X, 
  Users,
  MessageCircle,
  Search
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { ChatMessage } from './ChatMessage';
import { MentionInput } from './MentionInput';
import { extractUserIds, extractOrderIds } from '@/utils/chatUtils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatTimestamp } from '@/utils/chatUtils';

interface ChatMessageData {
  id: string;
  sender_id: string;
  message: string;
  user_mentions: string[];
  order_mentions: string[];
  created_at: string;
  sender?: {
    full_name: string;
    avatar_url?: string;
  };
  reactions?: Array<{
    emoji: string;
    count: number;
    userReacted: boolean;
    users: string[];
  }>;
}

interface UserPresence {
  user_id: string;
  status: 'online' | 'away' | 'offline';
  last_seen: string;
}

interface ChatInterfaceFullProps {
  onClose: () => void;
  scrollToMessageId?: string;
}

export function ChatInterfaceFull({ onClose, scrollToMessageId }: ChatInterfaceFullProps) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [profiles, setProfiles] = useState<Array<{ user_id: string; full_name: string; avatar_url?: string }>>([]);
  const [orders, setOrders] = useState<Array<{ id: string; order_number: string; order_type?: string }>>([]);
  const [userToEmployeeMap, setUserToEmployeeMap] = useState<Map<string, string>>(new Map());
  const [presence, setPresence] = useState<Map<string, UserPresence>>(new Map());
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [presenceTableExists, setPresenceTableExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);

        // Fetch profiles
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .or('status.eq.approved,role.eq.admin');

        if (profilesData) {
          setProfiles(profilesData);
        }

        // Fetch orders
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, order_number, order_type')
          .order('created_at', { ascending: false })
          .limit(100);

        if (ordersData) {
          setOrders(ordersData);
        }

        // Fetch employee mappings
        const { data: employeesData } = await supabase
          .from('employees')
          .select('id, personal_email, user_id')
          .not('personal_email', 'is', null);

        if (employeesData) {
          const userToEmployee = new Map<string, string>();
          const { data: allProfiles } = await supabase
            .from('profiles')
            .select('user_id, email');

          employeesData.forEach((emp: any) => {
            if (emp.user_id) {
              userToEmployee.set(emp.user_id, emp.id);
            }
            if (emp.personal_email && allProfiles) {
              const matchingProfile = allProfiles.find(p => p.email === emp.personal_email);
              if (matchingProfile) {
                userToEmployee.set(matchingProfile.user_id, emp.id);
              }
            }
          });

          setUserToEmployeeMap(userToEmployee);
        }

        // Fetch messages with reactions
        const { data: messagesData, error } = await supabase
          .from('chat_messages')
          .select(`
            id,
            sender_id,
            message,
            user_mentions,
            order_mentions,
            created_at,
            profiles!chat_messages_sender_id_fkey(user_id, full_name, avatar_url)
          `)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;

        // Fetch reactions for messages (if table exists)
        const messageIds = (messagesData || []).map((m: any) => m.id);
        let reactionsData = null;
        if (messageIds.length > 0) {
          const { data, error } = await supabase
            .from('chat_message_reactions')
            .select('message_id, user_id, emoji')
            .in('message_id', messageIds);
          
          // If table doesn't exist (404), that's okay - reactions will just be empty
          if (!error || (error.code !== 'PGRST301' && !error.message?.includes('404'))) {
            reactionsData = data;
          }
        }

        // Group reactions by message and emoji
        const reactionsMap = new Map<string, Map<string, { count: number; users: string[] }>>();
        (reactionsData || []).forEach((r: any) => {
          if (!reactionsMap.has(r.message_id)) {
            reactionsMap.set(r.message_id, new Map());
          }
          const messageReactions = reactionsMap.get(r.message_id)!;
          if (!messageReactions.has(r.emoji)) {
            messageReactions.set(r.emoji, { count: 0, users: [] });
          }
          const reaction = messageReactions.get(r.emoji)!;
          reaction.count++;
          reaction.users.push(r.user_id);
        });

        const formattedMessages: ChatMessageData[] = (messagesData || [])
          .reverse()
          .map((msg: any) => {
            const messageReactions = reactionsMap.get(msg.id);
            const reactions = messageReactions
              ? Array.from(messageReactions.entries()).map(([emoji, data]) => ({
                  emoji,
                  count: data.count,
                  userReacted: data.users.includes(user?.id || ''),
                  users: data.users,
                }))
              : [];

            return {
              id: msg.id,
              sender_id: msg.sender_id,
              message: msg.message,
              user_mentions: msg.user_mentions || [],
              order_mentions: msg.order_mentions || [],
              created_at: msg.created_at,
              sender: msg.profiles ? {
                full_name: msg.profiles.full_name,
                avatar_url: msg.profiles.avatar_url,
              } : undefined,
              reactions,
            };
          });

        setMessages(formattedMessages);
      } catch (error) {
        console.error('Error fetching chat data:', error);
        toast.error('Failed to load chat messages');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [user]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return;

    // Update user presence to online (if table exists)
    // Use async/await for better error handling
    (async () => {
      // If we already know the table doesn't exist, skip
      if (presenceTableExists === false) return;
      
      try {
        const { error } = await supabase
          .from('user_presence')
          .upsert({
            user_id: user.id,
            status: 'online',
            last_seen: new Date().toISOString(),
          });

        // If table doesn't exist, mark it and skip presence updates
        if (error && (error.code === 'PGRST301' || error.message?.includes('404'))) {
          setPresenceTableExists(false);
          return;
        }

        // Table exists, mark it
        setPresenceTableExists(true);

        // Fetch all presence statuses
        const { data, error: fetchError } = await supabase
          .from('user_presence')
          .select('*');

        // If table doesn't exist, skip
        if (fetchError && (fetchError.code === 'PGRST301' || fetchError.message?.includes('404'))) {
          setPresenceTableExists(false);
          return;
        }

        if (data) {
          const presenceMap = new Map<string, UserPresence>();
          data.forEach((p: any) => {
            // Only include users with 'online' or 'away' status (exclude 'offline')
            if (p.status === 'online' || p.status === 'away') {
              presenceMap.set(p.user_id, p);
            }
          });
          setPresence(presenceMap);
        }
      } catch {
        // Silently handle errors - table might not exist
        setPresenceTableExists(false);
      }
    })();

    // Set up presence update interval (mark as away after 5 minutes of inactivity)
    const presenceInterval = setInterval(() => {
      // Skip if table doesn't exist
      if (presenceTableExists === false) return;
      
      supabase
        .from('user_presence')
        .upsert({
          user_id: user.id,
          status: 'online',
          last_seen: new Date().toISOString(),
        })
        .catch(() => {
          // Silently handle errors - table might not exist
          setPresenceTableExists(false);
        });
    }, 60000); // Update every minute

    // Mark as offline on page unload
    const handleBeforeUnload = () => {
      // Skip if table doesn't exist
      if (presenceTableExists === false) return;
      
      supabase
        .from('user_presence')
        .upsert({
          user_id: user.id,
          status: 'offline',
          last_seen: new Date().toISOString(),
        })
        .catch(() => {
          // Silently handle errors - table might not exist
          setPresenceTableExists(false);
        });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Messages subscription with better connection handling
    const messagesChannel = supabase
      .channel('chat_messages_full', {
        config: {
          broadcast: { self: true },
          presence: { key: user.id }
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        async (payload) => {
          console.log('📨 Real-time message received:', payload);
          const newMessage = payload.new as any;
          
          // Fetch sender profile
          const { data: senderData } = await supabase
            .from('profiles')
            .select('user_id, full_name, avatar_url')
            .eq('user_id', newMessage.sender_id)
            .single();

          // Fetch reactions for the new message
          const { data: reactionsData } = await supabase
            .from('chat_message_reactions')
            .select('message_id, user_id, emoji')
            .eq('message_id', newMessage.id);

          // Group reactions
          const reactionsMap = new Map<string, { count: number; users: string[] }>();
          (reactionsData || []).forEach((r: any) => {
            if (!reactionsMap.has(r.emoji)) {
              reactionsMap.set(r.emoji, { count: 0, users: [] });
            }
            const reaction = reactionsMap.get(r.emoji)!;
            reaction.count++;
            reaction.users.push(r.user_id);
          });

          const reactions = Array.from(reactionsMap.entries()).map(([emoji, data]) => ({
            emoji,
            count: data.count,
            userReacted: data.users.includes(user?.id || ''),
            users: data.users,
          }));

          const formattedMessage: ChatMessageData = {
            id: newMessage.id,
            sender_id: newMessage.sender_id,
            message: newMessage.message,
            user_mentions: newMessage.user_mentions || [],
            order_mentions: newMessage.order_mentions || [],
            created_at: newMessage.created_at,
            sender: senderData ? {
              full_name: senderData.full_name,
              avatar_url: senderData.avatar_url,
            } : undefined,
            reactions,
          };

          setMessages((prev) => {
            // Check if message already exists (avoid duplicates)
            if (prev.some(m => m.id === newMessage.id)) {
              console.log('⚠️ Duplicate message detected, skipping:', newMessage.id);
              return prev;
            }
            console.log('✅ Adding new message to UI:', formattedMessage.id);
            return [...prev, formattedMessage];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_message_reactions',
        },
        async (payload) => {
          // Only process if table exists (no error in payload)
          if (payload.error) return;
          
          // Get the affected message ID from the payload
          const affectedMessageId = (payload.new as any)?.message_id || (payload.old as any)?.message_id;
          if (!affectedMessageId) return;

          // Fetch reactions for the affected message only (more efficient and real-time)
          const { data: reactionsData, error } = await supabase
            .from('chat_message_reactions')
            .select('message_id, user_id, emoji')
            .eq('message_id', affectedMessageId);

          // If table doesn't exist, skip reaction updates
          if (error && (error.code === 'PGRST301' || error.message?.includes('404'))) {
            return;
          }

          // Update only the affected message's reactions in real-time
          setMessages(prev => prev.map(msg => {
            if (msg.id !== affectedMessageId) return msg;
            
            // Build reactions map for this message
            const reactionsMap = new Map<string, { count: number; users: string[] }>();
            (reactionsData || []).forEach((r: any) => {
              if (!reactionsMap.has(r.emoji)) {
                reactionsMap.set(r.emoji, { count: 0, users: [] });
              }
              const reaction = reactionsMap.get(r.emoji)!;
              reaction.count++;
              reaction.users.push(r.user_id);
            });

            const reactions = Array.from(reactionsMap.entries()).map(([emoji, data]) => ({
              emoji,
              count: data.count,
              userReacted: data.users.includes(user?.id || ''),
              users: data.users,
            }));

            return { ...msg, reactions };
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
        },
        (payload) => {
          // Only process if no error
          if (payload.error) return;
          
          // Handle both INSERT and UPDATE events
          const presenceData = (payload.new || payload.old) as any;
          if (presenceData && presenceData.user_id) {
            setPresence(prev => {
              const newMap = new Map(prev);
              // If it's a DELETE event, remove the user
              if (payload.eventType === 'DELETE' || !payload.new) {
                newMap.delete(presenceData.user_id);
              } else {
                // INSERT or UPDATE - add/update the presence (only if online or away)
                if (presenceData.status === 'online' || presenceData.status === 'away') {
                  newMap.set(presenceData.user_id, presenceData);
                } else {
                  // Remove if status is offline
                  newMap.delete(presenceData.user_id);
                }
              }
              return newMap;
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
        },
        async (payload) => {
          // Only process if no error and payload has data
          if (payload.error || !payload.new) return;
          
          const typingData = payload.new as any;
          if (!typingData || !typingData.user_id) return;
          
          if (typingData.is_typing && typingData.user_id !== user.id) {
            setTypingUsers(prev => new Set(prev).add(typingData.user_id));
            setTimeout(() => {
              setTypingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(typingData.user_id);
                return newSet;
              });
            }, 3000);
          } else {
            setTypingUsers(prev => {
              const newSet = new Set(prev);
              newSet.delete(typingData.user_id);
              return newSet;
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Channel subscription error');
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ Subscription timed out, will retry...');
        } else if (status === 'CLOSED') {
          console.warn('🔌 Channel closed, will reconnect...');
        }
      });

    // Polling fallback: Fetch new messages every 2 seconds if subscription fails
    let lastMessageId: string | null = null;
    const pollingInterval = setInterval(async () => {
      try {
        const { data: latestMessages, error } = await supabase
          .from('chat_messages')
          .select('id, created_at')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error || !latestMessages) return;

        // If we have a new message that we don't have in our state
        if (latestMessages.id !== lastMessageId) {
          if (lastMessageId !== null) {
            // New message detected, fetch it
            const { data: newMessages, error: fetchError } = await supabase
              .from('chat_messages')
              .select(`
                id,
                sender_id,
                message,
                user_mentions,
                order_mentions,
                created_at,
                profiles!chat_messages_sender_id_fkey(user_id, full_name, avatar_url)
              `)
              .gt('created_at', new Date(Date.now() - 5000).toISOString())
              .order('created_at', { ascending: true });

            if (!fetchError && newMessages) {
              // Format and add new messages
              const formattedMessages = await Promise.all(
                newMessages.map(async (msg: any) => {
                  // Fetch reactions
                  const { data: reactionsData } = await supabase
                    .from('chat_message_reactions')
                    .select('message_id, user_id, emoji')
                    .eq('message_id', msg.id);

                  const reactionsMap = new Map<string, { count: number; users: string[] }>();
                  (reactionsData || []).forEach((r: any) => {
                    if (!reactionsMap.has(r.emoji)) {
                      reactionsMap.set(r.emoji, { count: 0, users: [] });
                    }
                    const reaction = reactionsMap.get(r.emoji)!;
                    reaction.count++;
                    reaction.users.push(r.user_id);
                  });

                  const reactions = Array.from(reactionsMap.entries()).map(([emoji, data]) => ({
                    emoji,
                    count: data.count,
                    userReacted: data.users.includes(user?.id || ''),
                    users: data.users,
                  }));

                  return {
                    id: msg.id,
                    sender_id: msg.sender_id,
                    message: msg.message,
                    user_mentions: msg.user_mentions || [],
                    order_mentions: msg.order_mentions || [],
                    created_at: msg.created_at,
                    sender: (msg as any).profiles ? {
                      full_name: (msg as any).profiles.full_name,
                      avatar_url: (msg as any).profiles.avatar_url,
                    } : undefined,
                    reactions,
                  };
                })
              );

              setMessages((prev) => {
                const existingIds = new Set(prev.map(m => m.id));
                const newMessages = formattedMessages.filter(m => !existingIds.has(m.id));
                if (newMessages.length > 0) {
                  console.log('🔄 Polling: Found', newMessages.length, 'new messages');
                  return [...prev, ...newMessages];
                }
                return prev;
              });
            }
          }
          lastMessageId = latestMessages.id;
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Initialize lastMessageId
    (async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data) lastMessageId = data.id;
    })();

    return () => {
      clearInterval(presenceInterval);
      clearInterval(pollingInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      supabase.removeChannel(messagesChannel);
      // Mark as offline (only if table exists)
      if (user && presenceTableExists !== false) {
        try {
          const upsertPromise = supabase
            .from('user_presence')
            .upsert({
              user_id: user.id,
              status: 'offline',
              last_seen: new Date().toISOString(),
            });
          
          if (upsertPromise && typeof upsertPromise.catch === 'function') {
            upsertPromise.catch(() => {
              // Silently handle errors - table might not exist
            });
          }
        } catch (error) {
          // Silently handle errors - table might not exist
        }
      }
    };
  }, [user, messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Scroll to specific message
  useEffect(() => {
    if (scrollToMessageId && user) {
      const messageElement = messageRefs.current.get(scrollToMessageId);
      if (messageElement) {
        setTimeout(() => {
          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedMessageId(scrollToMessageId);
          setTimeout(() => setHighlightedMessageId(null), 3000);

          supabase
            .from('chat_mentions_read')
            .upsert({
              message_id: scrollToMessageId,
              user_id: user.id,
              read_at: new Date().toISOString(),
            })
            .catch((error) => {
              console.error('Error marking mention as read:', error);
            });
        }, 100);
      }
    }
  }, [scrollToMessageId, user]);

  const handleSend = useCallback(
    async (message: string, userMentions: string[], orderMentions: string[]) => {
      if (!user || !message.trim()) return;

      setSending(true);
      try {
        const userIds = extractUserIds(userMentions, profiles);
        const orderIds = extractOrderIds(orderMentions, orders);

        const { data: insertedMessage, error } = await supabase
          .from('chat_messages')
          .insert({
            sender_id: user.id,
            message: message,
            user_mentions: userIds,
            order_mentions: orderIds,
          })
          .select(`
            id,
            sender_id,
            message,
            user_mentions,
            order_mentions,
            created_at,
            profiles!chat_messages_sender_id_fkey(user_id, full_name, avatar_url)
          `)
          .single();

        if (error) throw error;

        // Immediately add the message to the UI (optimistic update)
        if (insertedMessage) {
          const formattedMessage: ChatMessageData = {
            id: insertedMessage.id,
            sender_id: insertedMessage.sender_id,
            message: insertedMessage.message,
            user_mentions: insertedMessage.user_mentions || [],
            order_mentions: insertedMessage.order_mentions || [],
            created_at: insertedMessage.created_at,
            sender: (insertedMessage as any).profiles ? {
              full_name: (insertedMessage as any).profiles.full_name,
              avatar_url: (insertedMessage as any).profiles.avatar_url,
            } : profile ? {
              full_name: profile.full_name,
              avatar_url: profile.avatar_url,
            } : undefined,
            reactions: [],
          };

          setMessages((prev) => {
            // Check if message already exists (avoid duplicates)
            if (prev.some(m => m.id === formattedMessage.id)) {
              return prev;
            }
            return [...prev, formattedMessage];
          });
        }

        // Stop typing indicator
        await supabase
          .from('typing_indicators')
          .upsert({
            user_id: user.id,
            is_typing: false,
          });
      } catch (error: any) {
        console.error('Error sending message:', error);
        toast.error('Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [user, profiles, orders, profile]
  );

  const handleReactionClick = async (messageId: string, emoji: string) => {
    if (!user) return;

    try {
      // Check if user already reacted with this emoji
      const { data: existingReaction, error: checkError } = await supabase
        .from('chat_message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji)
        .maybeSingle();

      // If table doesn't exist (404), show helpful message
      if (checkError && (checkError.code === 'PGRST301' || checkError.message?.includes('404'))) {
        toast.error('Reactions feature requires database migration. Please run: 20250121000002_create_chat_reactions.sql');
        return;
      }

      if (existingReaction) {
        // Remove reaction
        const { error: deleteError } = await supabase
          .from('chat_message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id)
          .eq('emoji', emoji);
        
        if (deleteError && deleteError.code !== 'PGRST116') {
          console.error('Error removing reaction:', deleteError);
        }
      } else {
        // Add reaction
        const { error: insertError } = await supabase.from('chat_message_reactions').insert({
          message_id: messageId,
          user_id: user.id,
          emoji: emoji,
        });
        
        if (insertError) {
          console.error('Error adding reaction:', insertError);
          toast.error('Failed to add reaction. Please ensure migrations are run.');
        }
      }
    } catch (error: any) {
      console.error('Error toggling reaction:', error);
      if (error && (error.message?.includes('404') || error.code === 'PGRST301')) {
        toast.error('Reactions feature requires database migration. Please run: 20250121000002_create_chat_reactions.sql');
      }
    }
  };

  const handleTyping = useCallback(() => {
    if (!user) return;

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set typing to true
    supabase
      .from('typing_indicators')
      .upsert({
        user_id: user.id,
        is_typing: true,
      });

    // Set typing to false after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      supabase
        .from('typing_indicators')
        .upsert({
          user_id: user.id,
          is_typing: false,
        });
    }, 3000);
  }, [user]);

  const setMessageRef = useCallback((messageId: string, element: HTMLDivElement | null) => {
    if (element) {
      messageRefs.current.set(messageId, element);
    } else {
      messageRefs.current.delete(messageId);
    }
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getPresenceStatus = (userId: string): 'online' | 'away' | 'offline' => {
    // Current user is always considered online if they're using the chat
    if (userId === user?.id) return 'online';
    
    const userPresence = presence.get(userId);
    if (!userPresence) return 'offline';
    
    // If last seen is more than 5 minutes ago, mark as away
    const lastSeen = new Date(userPresence.last_seen);
    const now = new Date();
    const minutesSinceLastSeen = (now.getTime() - lastSeen.getTime()) / 60000;
    
    if (userPresence.status === 'offline') return 'offline';
    if (minutesSinceLastSeen > 5) return 'away';
    return userPresence.status as 'online' | 'away' | 'offline';
  };

  // Count online users (excluding current user from count, but including them in presence)
  const onlineUsers = profiles.filter(p => {
    const status = getPresenceStatus(p.user_id);
    return status === 'online';
  });
  
  // Total online count (including current user if they're online)
  const onlineCount = onlineUsers.length;
  
  const awayUsers = profiles.filter(p => getPresenceStatus(p.user_id) === 'away');
  const offlineUsers = profiles.filter(p => getPresenceStatus(p.user_id) === 'offline');

  const typingUserNames = Array.from(typingUsers)
    .map(userId => profiles.find(p => p.user_id === userId)?.full_name)
    .filter(Boolean);

  return (
    <div className="fixed bottom-20 right-4 w-96 h-[600px] flex flex-col shadow-2xl z-50 bg-background rounded-3xl border overflow-hidden animate-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-background">
        <div className="flex items-center gap-2">
          {/* Chat Logo/Icon */}
          <div className="relative">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-green-500 rounded-full border-2 border-background"></div>
          </div>
          <h2 
            className="text-xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent" 
            style={{ 
              fontFamily: "'Poppins', 'Inter', system-ui, sans-serif", 
              letterSpacing: '1.5px',
              fontWeight: 800,
              fontSize: '1.25rem'
            }}
          >
            Namma Maatu
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {onlineCount > 0 ? `${onlineCount} online` : '0 online'}
          </p>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowSearch(!showSearch)} 
            className="h-8 w-8"
            title="Search messages"
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose} 
            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar - Users List */}
        {showSidebar && (
          <div className="absolute inset-0 bg-background border-r z-10 flex flex-col">
            <div className="p-2 border-b">
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Team Members</span>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {profiles.map((profile) => {
                  const status = getPresenceStatus(profile.user_id);
                  return (
                    <div
                      key={profile.user_id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                    >
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
                          <AvatarFallback className="text-xs">
                            {getInitials(profile.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        {status === 'online' && (
                          <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-background shadow-sm" title="Online" />
                        )}
                        {status === 'away' && (
                          <div className="absolute bottom-0 right-0 h-3 w-3 bg-yellow-500 rounded-full border-2 border-background shadow-sm" title="Away" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm font-medium truncate">{profile.full_name}</div>
                          {status === 'online' && (
                            <div className="h-2 w-2 bg-green-500 rounded-full flex-shrink-0" title="Online" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {status === 'online' && 'Active now'}
                          {status === 'away' && 'Away'}
                          {status === 'offline' && 'Offline'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}


        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Bar */}
          {showSearch && (
            <div className="p-3 border-b bg-background">
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
                autoFocus
              />
            </div>
          )}

          {/* Messages Area */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-muted-foreground">Loading messages...</div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                <>
                  {(searchQuery.trim() 
                    ? messages.filter(m => 
                        m.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        m.sender?.full_name.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                    : messages
                  ).map((message) => (
                    <div
                      key={message.id}
                      ref={(el) => setMessageRef(message.id, el)}
                    >
                      <ChatMessage
                        id={message.id}
                        senderId={message.sender_id}
                        senderName={message.sender?.full_name || 'Unknown User'}
                        senderAvatar={message.sender?.avatar_url}
                        message={message.message}
                        userMentions={message.user_mentions}
                        orderMentions={message.order_mentions}
                        createdAt={message.created_at}
                        currentUserId={user?.id || ''}
                        isHighlighted={highlightedMessageId === message.id}
                        userToEmployeeMap={userToEmployeeMap}
                        orders={orders}
                        profiles={profiles}
                        reactions={message.reactions}
                        onReactionClick={handleReactionClick}
                      />
                    </div>
                  ))}
                  {typingUserNames.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground italic">
                      <span>{typingUserNames.join(', ')}</span>
                      <span>{typingUserNames.length === 1 ? 'is' : 'are'}</span>
                      <span>typing...</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t bg-background">
            <MentionInput
              onSend={handleSend}
              disabled={sending}
              placeholder={`Message Namma Maatu...`}
              onTyping={handleTyping}
            />
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="flex items-center justify-center border-t bg-background p-3 px-6 gap-4">
        <Button
          variant={showSidebar ? 'secondary' : 'ghost'}
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={() => {
            setShowSidebar(!showSidebar);
          }}
          title="Members"
        >
          <Users className="h-5 w-5" />
        </Button>
        
        <Button
          variant={!showSidebar ? 'default' : 'ghost'}
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={() => {
            setShowSidebar(false);
          }}
          title="Chat"
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

