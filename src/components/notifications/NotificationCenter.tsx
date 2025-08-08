import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Bell, User, Package, AlertCircle, CheckCircle, X, Clock, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'user_registration' | 'order_update' | 'quality_alert' | 'system' | 'achievement';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  priority?: 'low' | 'medium' | 'high';
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const { profile } = useAuth();

  const mockNotifications: Notification[] = [
    {
      id: '1',
      type: 'user_registration',
      title: 'New User Registration',
      message: 'John Doe has registered and is waiting for approval',
      read: false,
      created_at: new Date().toISOString(),
      priority: 'medium'
    },
    {
      id: '2',
      type: 'order_update',
      title: 'Order Status Update',
      message: 'Order #ORD-2024-0001 has moved to quality check',
      read: false,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      priority: 'high'
    },
    {
      id: '3',
      type: 'quality_alert',
      title: 'Quality Alert',
      message: 'Quality check failed for Order #ORD-2024-0002',
      read: true,
      created_at: new Date(Date.now() - 7200000).toISOString(),
      priority: 'high'
    },
    {
      id: '4',
      type: 'achievement',
      title: 'Achievement Unlocked!',
      message: 'You\'ve completed 50 orders this month!',
      read: false,
      created_at: new Date(Date.now() - 1800000).toISOString(),
      priority: 'low'
    }
  ];

  useEffect(() => {
    // Set mock notifications
    setNotifications(mockNotifications);
    setUnreadCount(mockNotifications.filter(n => !n.read).length);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

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

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
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
        <SheetHeader className="border-b pb-4">
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
        
        <div className="mt-6 space-y-3 max-h-[calc(100vh-120px)] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">No notifications</p>
              <p className="text-sm text-muted-foreground mt-1">You're all caught up!</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <Card 
                key={notification.id} 
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md border-l-4",
                  !notification.read ? 'bg-accent/50 border-l-primary' : 'border-l-transparent',
                  getNotificationColor(notification.type, notification.priority)
                )}
                onClick={() => markAsRead(notification.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start space-x-3">
                    <div className={cn(
                      "mt-1 p-2 rounded-full",
                      getNotificationColor(notification.type, notification.priority)
                    )}>
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