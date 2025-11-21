import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, X } from 'lucide-react';
import { ChatInterfaceFull } from './ChatInterfaceFull';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface FloatingChatButtonProps {
  openToMessageId?: string;
}

export function FloatingChatButton({ openToMessageId }: FloatingChatButtonProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [scrollToMessageId, setScrollToMessageId] = useState<string | undefined>(openToMessageId);

  // Load saved state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem('chatOpen');
    if (savedState === 'true') {
      setIsOpen(true);
    }
  }, []);

  // Fetch unread mentions count
  useEffect(() => {
    if (!user) return;

    const fetchUnreadCount = async () => {
      try {
        // Get all messages where current user is mentioned
        // Fetch recent messages and filter client-side for mentions
        const { data: allMessages, error } = await supabase
          .from('chat_messages')
          .select('id, user_mentions')
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) throw error;

        // Filter messages where current user is mentioned
        const messages = (allMessages || []).filter((msg: any) => {
          if (!msg.user_mentions || !Array.isArray(msg.user_mentions)) return false;
          return msg.user_mentions.includes(user.id);
        });

        if (!messages || messages.length === 0) {
          setUnreadCount(0);
          return;
        }

        // Check which mentions are unread
        const messageIds = messages.map((m) => m.id);
        const { data: readMentions } = await supabase
          .from('chat_mentions_read')
          .select('message_id')
          .eq('user_id', user.id)
          .in('message_id', messageIds);

        const readMessageIds = new Set(readMentions?.map((r) => r.message_id) || []);
        const unreadMessages = messages.filter((m) => !readMessageIds.has(m.id));
        setUnreadCount(unreadMessages.length);
      } catch (error) {
        console.error('Error fetching unread count:', error);
      }
    };

    fetchUnreadCount();

    // Set up real-time subscription for new mentions
    const channel = supabase
      .channel('chat_mentions', {
        config: {
          broadcast: { self: true }
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          console.log('🔔 New message received in FloatingChatButton:', payload);
          const newMessage = payload.new as any;
          // Check if current user is mentioned in the message
          if (
            newMessage.user_mentions &&
            Array.isArray(newMessage.user_mentions) &&
            newMessage.user_mentions.includes(user.id)
          ) {
            console.log('✅ User mentioned, refreshing unread count');
            // Refetch unread count to ensure accuracy
            const refreshUnreadCount = async () => {
              try {
                const { data: allMessages } = await supabase
                  .from('chat_messages')
                  .select('id, user_mentions')
                  .order('created_at', { ascending: false })
                  .limit(200);

                const messages = (allMessages || []).filter((msg: any) => {
                  if (!msg.user_mentions || !Array.isArray(msg.user_mentions)) return false;
                  return msg.user_mentions.includes(user.id);
                });

                if (!messages || messages.length === 0) {
                  setUnreadCount(0);
                  return;
                }

                const messageIds = messages.map((m) => m.id);
                const { data: readMentions } = await supabase
                  .from('chat_mentions_read')
                  .select('message_id')
                  .eq('user_id', user.id)
                  .in('message_id', messageIds);

                const readMessageIds = new Set(readMentions?.map((r) => r.message_id) || []);
                const unreadMessages = messages.filter((m) => !readMessageIds.has(m.id));
                setUnreadCount(unreadMessages.length);
              } catch (error) {
                console.error('Error refreshing unread count:', error);
              }
            };
            refreshUnreadCount();
          }
        }
      )
      .subscribe((status) => {
        console.log('🔔 FloatingChatButton subscription status:', status);
      });

    // Polling fallback: Refresh unread count every 3 seconds
    const pollingInterval = setInterval(() => {
      fetchUnreadCount();
    }, 3000);

    return () => {
      clearInterval(pollingInterval);
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Update scrollToMessageId when openToMessageId changes
  useEffect(() => {
    if (openToMessageId) {
      setScrollToMessageId(openToMessageId);
      setIsOpen(true);
      localStorage.setItem('chatOpen', 'true');
    }
  }, [openToMessageId]);

  // Listen for custom event from NotificationCenter
  useEffect(() => {
    const handleOpenChat = (event: CustomEvent) => {
      const { messageId } = event.detail;
      if (messageId) {
        setScrollToMessageId(messageId);
        setIsOpen(true);
        localStorage.setItem('chatOpen', 'true');
      }
    };

    window.addEventListener('openChatToMessage', handleOpenChat as EventListener);
    return () => {
      window.removeEventListener('openChatToMessage', handleOpenChat as EventListener);
    };
  }, []);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    localStorage.setItem('chatOpen', String(newState));
    if (!newState) {
      setScrollToMessageId(undefined);
    }
    // Note: Unread count will be refreshed by the polling interval
  };

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem('chatOpen', 'false');
    setScrollToMessageId(undefined);
  };

  if (!user) return null;

  return (
    <>
      <Button
        onClick={handleToggle}
        size="lg"
        className={cn(
          'fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-50 transition-all',
          'hover:scale-110 active:scale-95',
          isOpen && 'hidden'
        )}
      >
        <MessageCircle className="h-6 w-6" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>
      {isOpen && (
        <ChatInterfaceFull onClose={handleClose} scrollToMessageId={scrollToMessageId} />
      )}
    </>
  );
}

