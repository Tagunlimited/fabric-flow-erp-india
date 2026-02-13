import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, User, Package, AlertCircle, CheckCircle, X, Clock, Zap, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'user_registration' | 'order_update' | 'quality_alert' | 'system' | 'achievement' | 'chat_mention';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  priority?: 'low' | 'medium' | 'high';
  messageId?: string; // For chat mentions
  senderName?: string; // For chat mentions
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeTab, setActiveTab] = useState<'unread' | 'read'>('unread');
  const { profile, user } = useAuth();

  // Fetch unread chat mentions
  const fetchChatMentions = async () => {
    if (!user) return;

    try {
      // Get all messages where current user is mentioned
      // user_mentions is a JSONB array containing user_ids
      // Fetch recent messages and filter client-side (Supabase's .contains() for JSONB can be unreliable)
      const { data: allMessages, error } = await supabase
        .from('chat_messages')
        .select(`
          id,
          message,
          created_at,
          user_mentions,
          profiles!chat_messages_sender_id_fkey(full_name, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .limit(200); // Fetch more to ensure we get all mentions

      if (error) throw error;

      // Filter messages where current user is mentioned
      const messages = (allMessages || []).filter((msg: any) => {
        if (!msg.user_mentions || !Array.isArray(msg.user_mentions)) return false;
        return msg.user_mentions.includes(user.id);
      }).slice(0, 50); // Limit to 50 after filtering

      if (error) throw error;

      if (!messages || messages.length === 0) return [];

      // Check which mentions are already marked as read for this user
      const messageIds = messages.map((m) => m.id);
      const { data: readMentions } = await supabase
        .from('chat_mentions_read')
        .select('message_id')
        .eq('user_id', user.id)
        .in('message_id', messageIds);

      const readMessageIds = new Set(readMentions?.map((r) => r.message_id) || []);

      // Convert to notifications for both read and unread mentions
      const mentionNotifications: Notification[] = messages.map((msg: any) => ({
        id: `mention-${msg.id}`,
        type: 'chat_mention' as const,
        title: `Mentioned by ${msg.profiles?.full_name || 'Unknown'}`,
        message: msg.message.length > 100 ? msg.message.substring(0, 100) + '...' : msg.message,
        read: readMessageIds.has(msg.id),
        created_at: msg.created_at,
        priority: 'medium' as const,
        messageId: msg.id,
        senderName: msg.profiles?.full_name,
      }));

      return mentionNotifications;
    } catch (error) {
      console.error('Error fetching chat mentions:', error);
      return [];
    }
  };

  useEffect(() => {
    // Initialize with empty notifications - data will be loaded from backend
    setNotifications([]);
    setUnreadCount(0);

    const loadNotifications = async () => {
      try {
      // Load chat mentions
      const mentionNotifications = await fetchChatMentions();
        
        // Ensure mentionNotifications is an array
        const safeMentionNotifications = Array.isArray(mentionNotifications) ? mentionNotifications : [];
      
      // Combine with other notifications
        const allNotifications = [...safeMentionNotifications];
      setNotifications(allNotifications);
      setUnreadCount(allNotifications.filter(n => !n.read).length);
      } catch (error) {
        console.error('Error loading notifications:', error);
        setNotifications([]);
        setUnreadCount(0);
      }
    };

    loadNotifications();

    // Set up real-time subscriptions
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'profiles' }, 
        (payload) => {
          if (profile?.role === 'admin') {
            const newNotification: Notification = {
              id: Date.now().toString(),
              type: 'user_registration',
              title: 'New User Registration',
              message: `${payload.new.full_name} has registered and is waiting for approval`,
              read: false,
              created_at: new Date().toISOString(),
              priority: 'medium'
            };
            
            setNotifications(prev => [newNotification, ...prev]);
            setUnreadCount(prev => prev + 1);
            
            // Animate notification bell
            setIsAnimating(true);
            setTimeout(() => setIsAnimating(false), 1000);
            
            // Play notification sound
            playNotificationSound();
          }
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          if (!user || !profile) return;
          
          const newMessage = payload.new as any;
          // user_mentions contains profile user_ids (which match auth.users.id)
          // Check if current user's id is in the mentions array
          if (newMessage.user_mentions && 
              Array.isArray(newMessage.user_mentions) && 
              newMessage.user_mentions.includes(user.id)) {
            // Fetch sender info
            const { data: senderData } = await supabase
              .from('profiles')
              .select('full_name, avatar_url')
              .eq('user_id', newMessage.sender_id)
              .single();

            const newNotification: Notification = {
              id: `mention-${newMessage.id}`,
              type: 'chat_mention',
              title: `Mentioned by ${senderData?.full_name || 'Unknown'}`,
              message: newMessage.message.length > 100 ? newMessage.message.substring(0, 100) + '...' : newMessage.message,
              read: false,
              created_at: newMessage.created_at,
              priority: 'medium',
              messageId: newMessage.id,
              senderName: senderData?.full_name,
            };

            setNotifications(prev => [newNotification, ...prev]);
            setUnreadCount(prev => prev + 1);
            
            setIsAnimating(true);
            setTimeout(() => setIsAnimating(false), 1000);
            playNotificationSound();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, user]);

  const playNotificationSound = () => {
    // Create a simple notification sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const markAsRead = async (id: string) => {
    const notification = notifications.find(n => n.id === id);
    
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    // If it's a chat mention, mark it as read in database
    if (notification?.type === 'chat_mention' && notification.messageId && user) {
      try {
        await supabase
          .from('chat_mentions_read')
          .upsert({
            message_id: notification.messageId,
            user_id: user.id,
            read_at: new Date().toISOString(),
          });
      } catch (error) {
        console.error('Error marking mention as read:', error);
      }
    }

    // If it's a chat mention, open chat and scroll to message
    if (notification?.type === 'chat_mention' && notification.messageId) {
      // Emit custom event to open chat
      window.dispatchEvent(new CustomEvent('openChatToMessage', {
        detail: { messageId: notification.messageId }
      }));
    }
  };

  const markAllAsRead = async () => {
    // Optimistically update UI
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);

    // Persist read state for chat mentions so they don't re-appear after refresh
    try {
      if (!user) return;

      const mentionNotifications = notifications.filter(
        (n) => n.type === 'chat_mention' && !n.read && n.messageId
      );

      if (mentionNotifications.length === 0) return;

      const rows = mentionNotifications.map((n) => ({
        message_id: n.messageId!,
        user_id: user.id,
        read_at: new Date().toISOString(),
      }));

      await supabase.from('chat_mentions_read').upsert(rows);
    } catch (error) {
      console.error('Error marking all mentions as read:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'user_registration':
        return <User className="w-4 h-4" />;
      case 'order_update':
        return <Package className="w-4 h-4" />;
      case 'quality_alert':
        return <AlertCircle className="w-4 h-4" />;
      case 'achievement':
        return <Zap className="w-4 h-4" />;
      case 'chat_mention':
        return <MessageCircle className="w-4 h-4" />;
      default:
        return <CheckCircle className="w-4 h-4" />;
    }
  };

  const getNotificationColor = (type: string, priority?: string) => {
    if (priority === 'high') {
      return 'text-red-600 bg-red-50 border-red-200';
    }
    if (priority === 'medium') {
      return 'text-orange-600 bg-orange-50 border-orange-200';
    }
    
    switch (type) {
      case 'user_registration':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'order_update':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'quality_alert':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'achievement':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'chat_mention':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            "relative transition-all duration-300 hover:scale-105",
            isAnimating && "animate-pulse"
          )}
        >
          <Bell className={cn(
            "w-5 h-5 transition-all duration-300",
            isAnimating && "animate-bounce"
          )} />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center text-xs bg-red-500 text-white animate-pulse"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-96 sm:w-[400px]">
        <SheetHeader className="border-b pb-3">
          <SheetTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bell className="w-5 h-5" />
              <span>Notifications</span>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unreadCount}
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
                Mark all read
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'unread' | 'read')}
          className="mt-3"
        >
          <TabsList className="w-full bg-blue-50">
            <TabsTrigger
              value="unread"
              className={cn(
                'flex-1 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 data-[state=active]:shadow-sm',
                'data-[state=inactive]:text-blue-900'
              )}
            >
              Unread ({notifications.filter((n) => !n.read).length})
            </TabsTrigger>
            <TabsTrigger
              value="read"
              className={cn(
                'flex-1 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 data-[state=active]:shadow-sm',
                'data-[state=inactive]:text-blue-900'
              )}
            >
              Read ({notifications.filter((n) => n.read).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4 space-y-3 max-h-[calc(100vh-140px)] overflow-y-auto">
          {notifications.filter((n) => (activeTab === 'unread' ? !n.read : n.read)).length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">
                {activeTab === 'unread' ? 'No unread notifications' : 'No read notifications yet'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {activeTab === 'unread'
                  ? "You're all caught up!"
                  : 'Read notifications will appear here.'}
              </p>
            </div>
          ) : (
            notifications
              .filter((n) => (activeTab === 'unread' ? !n.read : n.read))
              .map((notification) => (
                <Card
                  key={notification.id}
                  className={cn(
                    'cursor-pointer transition-all duration-200 hover:shadow-md border-l-4',
                    !notification.read ? 'bg-accent/50 border-l-primary' : 'border-l-transparent',
                    getNotificationColor(notification.type, notification.priority)
                  )}
                  onClick={() => {
                    if (!notification.read) {
                      markAsRead(notification.id);
                    }
                    if (notification.type === 'chat_mention') {
                      setIsOpen(false);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <div
                        className={cn(
                          'mt-1 p-2 rounded-full',
                          getNotificationColor(notification.type, notification.priority)
                        )}
                      >
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="text-sm font-semibold truncate">
                              {notification.title}
                            </h4>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {notification.message}
                            </p>
                          </div>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-primary rounded-full ml-2 mt-1 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>{getTimeAgo(notification.created_at)}</span>
                          </div>
                          {notification.priority === 'high' && (
                            <Badge variant="destructive" className="text-xs">
                              High Priority
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}