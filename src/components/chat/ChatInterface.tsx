import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { ChatMessage } from './ChatMessage';
import { MentionInput } from './MentionInput';
import { extractUserIds, extractOrderIds } from '@/utils/chatUtils';
import { toast } from 'sonner';

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
}

interface ChatInterfaceProps {
  onClose: () => void;
  scrollToMessageId?: string;
}

export function ChatInterface({ onClose, scrollToMessageId }: ChatInterfaceProps) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [profiles, setProfiles] = useState<Array<{ user_id: string; full_name: string; avatar_url?: string }>>([]);
  const [orders, setOrders] = useState<Array<{ id: string; order_number: string; order_type?: string }>>([]);
  const [userToEmployeeMap, setUserToEmployeeMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);

        // Fetch profiles for user mentions
        // Include all approved users AND all admins (so everyone can tag admins)
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .or('status.eq.approved,role.eq.admin');

        if (profilesData) {
          setProfiles(profilesData);
        }

        // Fetch recent orders for order mentions
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, order_number, order_type')
          .order('created_at', { ascending: false })
          .limit(100);

        if (ordersData) {
          setOrders(ordersData);
        }

        // Fetch employee mappings (user_id -> employee_id) for clickable user mentions
        const { data: employeesData } = await supabase
          .from('employees')
          .select('id, personal_email, user_id')
          .not('personal_email', 'is', null);

        if (employeesData) {
          // Create a map of user_id to employee_id
          // First try to match by user_id if the column exists
          const userToEmployee = new Map<string, string>();
          
          // Also fetch profiles to match by email
          const { data: allProfiles } = await supabase
            .from('profiles')
            .select('user_id, email');

          employeesData.forEach((emp: any) => {
            // Try direct user_id match first
            if (emp.user_id) {
              userToEmployee.set(emp.user_id, emp.id);
            }
            // Also try email match
            if (emp.personal_email && allProfiles) {
              const matchingProfile = allProfiles.find(p => p.email === emp.personal_email);
              if (matchingProfile) {
                userToEmployee.set(matchingProfile.user_id, emp.id);
              }
            }
          });

          setUserToEmployeeMap(userToEmployee);
        }

        // Fetch initial messages
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

        const formattedMessages: ChatMessageData[] = (messagesData || [])
          .reverse()
          .map((msg: any) => ({
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
          }));

        setMessages(formattedMessages);
      } catch (error) {
        console.error('Error fetching chat data:', error);
        toast.error('Failed to load chat messages');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Set up real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('chat_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        async (payload) => {
          const newMessage = payload.new as any;

          // Fetch sender profile
          const { data: senderData } = await supabase
            .from('profiles')
            .select('user_id, full_name, avatar_url')
            .eq('user_id', newMessage.sender_id)
            .single();

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
          };

          setMessages((prev) => [...prev, formattedMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Scroll to specific message and mark as read
  useEffect(() => {
    if (scrollToMessageId && user) {
      const messageElement = messageRefs.current.get(scrollToMessageId);
      if (messageElement) {
        setTimeout(() => {
          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedMessageId(scrollToMessageId);
          setTimeout(() => setHighlightedMessageId(null), 3000);

          // Mark mention as read
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
        // Extract user IDs from mentions
        const userIds = extractUserIds(userMentions, profiles);
        const orderIds = extractOrderIds(orderMentions, orders);

        const { error } = await supabase.from('chat_messages').insert({
          sender_id: user.id,
          message: message,
          user_mentions: userIds,
          order_mentions: orderIds,
        });

        if (error) throw error;

        // Mark mentions as read for the sender (they've seen their own message)
        if (userIds.length > 0 || orderIds.length > 0) {
          // This will be handled by the real-time subscription
        }
      } catch (error: any) {
        console.error('Error sending message:', error);
        toast.error('Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [user, profiles, orders]
  );

  const setMessageRef = useCallback((messageId: string, element: HTMLDivElement | null) => {
    if (element) {
      messageRefs.current.set(messageId, element);
    } else {
      messageRefs.current.delete(messageId);
    }
  }, []);

  return (
    <Card className="fixed bottom-20 right-4 w-96 h-[600px] flex flex-col shadow-2xl z-50 animate-in slide-in-from-bottom-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
        <CardTitle>Team Chat</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((message) => (
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
                    />
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <MentionInput
              onSend={handleSend}
              disabled={sending}
              placeholder="Type a message... (use @ for users, # for orders)"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

