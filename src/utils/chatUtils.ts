import React from 'react';

/**
 * Parse mentions from a message string
 * Returns arrays of mentioned usernames and order numbers
 */
export function parseMentions(message: string): {
  userMentions: string[];
  orderMentions: string[];
} {
  const userMentions: string[] = [];
  const orderMentions: string[] = [];

  // Match @mentions (e.g., @john.doe or @John Doe)
  const userMentionRegex = /@([^\s@#]+)/g;
  let match;
  while ((match = userMentionRegex.exec(message)) !== null) {
    userMentions.push(match[1]);
  }

  // Match #mentions (e.g., #ORD-12345)
  const orderMentionRegex = /#([^\s@#]+)/g;
  while ((match = orderMentionRegex.exec(message)) !== null) {
    orderMentions.push(match[1]);
  }

  return { userMentions, orderMentions };
}

/**
 * Extract user IDs from user mentions by matching with profiles
 */
export function extractUserIds(
  userMentions: string[],
  profiles: Array<{ user_id: string; full_name: string }>
): string[] {
  const userIds: string[] = [];
  
  for (const mention of userMentions) {
    // Try exact match first
    const exactMatch = profiles.find(
      p => p.full_name.toLowerCase() === mention.toLowerCase()
    );
    if (exactMatch) {
      userIds.push(exactMatch.user_id);
      continue;
    }

    // Try partial match (e.g., "john" matches "John Doe")
    const partialMatch = profiles.find(
      p => p.full_name.toLowerCase().includes(mention.toLowerCase()) ||
           mention.toLowerCase().includes(p.full_name.toLowerCase())
    );
    if (partialMatch && !userIds.includes(partialMatch.user_id)) {
      userIds.push(partialMatch.user_id);
    }
  }

  return userIds;
}

/**
 * Extract order IDs from order mentions by matching with orders
 */
export function extractOrderIds(
  orderMentions: string[],
  orders: Array<{ id: string; order_number: string }>
): string[] {
  const orderIds: string[] = [];
  
  for (const mention of orderMentions) {
    const match = orders.find(
      o => o.order_number.toLowerCase() === mention.toLowerCase()
    );
    if (match && !orderIds.includes(match.id)) {
      orderIds.push(match.id);
    }
  }

  return orderIds;
}

/**
 * Highlight mentions in message text and make them clickable
 * Returns JSX elements with highlighted, clickable mentions
 */
export function highlightMentions(
  message: string,
  userMentions: string[],
  orderMentions: string[],
  onUserMentionClick?: (username: string, userId: string) => void,
  onOrderMentionClick?: (orderNumber: string, orderId: string) => void,
  usernameToUserIdMap?: Map<string, string>,
  orderNumberToIdMap?: Map<string, { id: string; order_type?: string }>
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let keyCounter = 0;

  // Create a combined regex for all mentions
  const mentionRegex = /(@[^\s@#]+|#[^\s@#]+)/g;
  let match;

  while ((match = mentionRegex.exec(message)) !== null) {
    const beforeMatch = message.slice(lastIndex, match.index);
    if (beforeMatch) {
      parts.push(beforeMatch);
    }

    const mentionText = match[0];
    const mentionValue = mentionText.slice(1); // Remove @ or #
    const key = `mention-${keyCounter++}`;

    if (mentionText.startsWith('@')) {
      // User mention - highlight in primary color and make clickable
      const userId = usernameToUserIdMap?.get(mentionValue.toLowerCase());
      const isClickable = userId && onUserMentionClick;
      
      parts.push(
        React.createElement(
          'span',
          {
            key: key,
            className: isClickable 
              ? 'text-primary font-semibold cursor-pointer hover:underline' 
              : 'text-primary font-semibold',
            onClick: isClickable 
              ? (e: React.MouseEvent) => {
                  e.stopPropagation();
                  onUserMentionClick(mentionValue, userId);
                }
              : undefined,
            title: isClickable ? 'Click to view profile' : undefined
          },
          mentionText
        )
      );
    } else if (mentionText.startsWith('#')) {
      // Order mention - highlight in accent color and make clickable
      const orderInfo = orderNumberToIdMap?.get(mentionValue);
      const isClickable = orderInfo && onOrderMentionClick;
      
      parts.push(
        React.createElement(
          'span',
          {
            key: key,
            className: isClickable 
              ? 'text-accent font-semibold cursor-pointer hover:underline' 
              : 'text-accent font-semibold',
            onClick: isClickable 
              ? (e: React.MouseEvent) => {
                  e.stopPropagation();
                  onOrderMentionClick(mentionValue, orderInfo.id);
                }
              : undefined,
            title: isClickable ? 'Click to view order' : undefined
          },
          mentionText
        )
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < message.length) {
    parts.push(message.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [message];
}

/**
 * Format timestamp to relative time (e.g., "2m ago", "1h ago", "2d ago")
 */
export function formatTimestamp(createdAt: string): string {
  const now = new Date();
  const messageDate = new Date(createdAt);
  const diffInSeconds = Math.floor((now.getTime() - messageDate.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }

  // For older messages, show date
  return messageDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: messageDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

