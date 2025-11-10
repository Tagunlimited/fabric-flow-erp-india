import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Package, 
  Truck, 
  CheckCircle, 
  DollarSign,
  Users,
  Scissors,
  Plus,
  AlertCircle,
  CalendarDays,
  XCircle,
  Eye
} from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { toast } from "sonner";

interface CalendarEvent {
  id: string;
  title: string;
  type: 'delivery' | 'production' | 'payment' | 'meeting' | 'cutting' | 'quality' | 'task' | 'event';
  time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'overdue' | 'cancelled';
  details: string;
  priority: 'low' | 'medium' | 'high';
  department?: string;
  assignedTo?: string | string[]; // Support both single and multiple assignments
  assignedBy?: string;
  deadline?: string;
  createdAt?: string;
  assignedEmployees?: Array<{id: string, name: string, avatar_url?: string | null}>; // For display purposes
}

export function CalendarView() {
  const [events, setEvents] = useState<{ [key: string]: CalendarEvent[] }>({});
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'cancelled'>('active');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: '',
    type: 'task' as CalendarEvent['type'],
    time: '',
    details: '',
    priority: 'medium' as CalendarEvent['priority'],
    department: '',
    assignedTo: [] as string[], // Changed to array for multiple employees
    deadline: '',
    date: ''
  });
  const [departments, setDepartments] = useState<string[]>([]);
  const [employees, setEmployees] = useState<Array<{id: string, name: string, department: string, avatar_url?: string | null}>>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Array<{id: string, name: string, department: string, avatar_url?: string | null}>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data from Supabase
  useEffect(() => {
    const fetchAllData = async () => {
      await fetchDepartments();
      await fetchEmployees();
      await fetchEvents();
    };
    fetchAllData();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .order('date', { ascending: true });
      if (error) throw error;
      // Group events by date and remove duplicates
      const eventMap: { [key: string]: CalendarEvent[] } = {};
      data.forEach((event: any) => {
        const dateKey = new Date(event.date).toDateString();
        if (!eventMap[dateKey]) eventMap[dateKey] = [];        
        // Parse assigned_to field (could be JSON array or single value)
        let assignedToIds: string[] = [];
        let assignedEmployees: Array<{id: string, name: string, avatar_url?: string | null}> = [];
        
        if (event.assigned_to) {
          try {
            // Try to parse as JSON array first
            assignedToIds = JSON.parse(event.assigned_to);
          } catch {
            // If not JSON, treat as single value
            assignedToIds = [event.assigned_to];
          }
          
          // Get employee names and avatars for display
          assignedEmployees = assignedToIds.map((id: string) => {
            const employee = employees.find(emp => emp.id === id);
            return {
              id,
              name: employee ? employee.name : 'Unknown Employee',
              avatar_url: employee?.avatar_url || null
            };
          });
        }
        
        eventMap[dateKey].push({
          id: event.id,
          title: event.title,
          type: event.type,
          time: event.time,
          status: event.status,
          details: event.details,
          priority: event.priority,
          department: event.department,
          assignedTo: assignedToIds.length > 1 ? assignedToIds : assignedToIds[0] || null,
          assignedBy: event.assigned_by,
          deadline: event.deadline,
          createdAt: event.created_at,
          assignedEmployees: assignedEmployees,
        });
      });
      
      // Remove duplicates based on original ID
      Object.keys(eventMap).forEach(dateKey => {
        const uniqueEvents: CalendarEvent[] = [];
        const seenIds = new Set<string>();
        
        eventMap[dateKey].forEach(event => {
          const originalId = event.id.split('-moved-')[0];
          if (!seenIds.has(originalId)) {
            seenIds.add(originalId);
            uniqueEvents.push({ ...event, id: originalId }); // Use original ID
          }
        });
        
        eventMap[dateKey] = uniqueEvents;
      });
      
      setEvents(eventMap);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Refetch events when employees are first loaded to ensure avatars are populated
  // This ensures that employee avatars are available when events are displayed
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  
  useEffect(() => {
    if (employees.length > 0 && !employeesLoaded) {
      setEmployeesLoaded(true);
      // Refetch events to populate avatars now that employees are loaded
      fetchEvents();
    }
  }, [employees.length, employeesLoaded]);

  const fetchDepartments = async () => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .order('name');
      
      if (error) {
        console.error('Error fetching departments:', error);
        toast.error('Failed to load departments');
      } else if (data && !Array.isArray(data) === false) {
        // Convert to array of department names for the select dropdown
        const departmentNames = (data as any[]).map(dept => dept.name);
        setDepartments(departmentNames);
      }
    } catch (err: any) {
      console.error('Error fetching departments:', err);
      toast.error('Failed to load departments');
    }
  };

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, department, avatar_url')
        .order('full_name');
      
      if (error) {
        console.error('Error fetching employees:', error);
        toast.error('Failed to load employees');
      } else if (data && !Array.isArray(data) === false) {
        const employeeList = (data as any[]).map(emp => ({
          id: emp.id,
          name: emp.full_name,
          department: emp.department || 'Unknown',
          avatar_url: emp.avatar_url || null
        }));
        setEmployees(employeeList);
        setFilteredEmployees(employeeList);
      }
    } catch (err: any) {
      console.error('Error fetching employees:', err);
      toast.error('Failed to load employees');
    }
  };


  // Filter employees when department changes
  useEffect(() => {
    if (newEvent.department) {
      const filtered = employees.filter(emp => emp.department === newEvent.department);
      setFilteredEmployees(filtered);
      // Reset assignedTo if the selected users are not in the new department
      const validAssignedIds = newEvent.assignedTo.filter(empId => 
        filtered.some(emp => emp.id === empId)
      );
      if (validAssignedIds.length !== newEvent.assignedTo.length) {
        setNewEvent(prev => ({ ...prev, assignedTo: validAssignedIds }));
      }
    } else {
      setFilteredEmployees(employees);
    }
  }, [newEvent.department, employees]);

  // Add event to Supabase
  const handleAddEvent = async () => {
    // Validate required fields
    if (!newEvent.title.trim()) {
      toast.error('Please enter a title for the event');
      return;
    }
    if (!newEvent.date) {
      toast.error('Please select a date for the event');
      return;
    }


    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.from('calendar_events').insert({
        title: newEvent.title,
        type: newEvent.type,
        time: newEvent.time || null,
        status: 'pending' as const,
        details: newEvent.details || null,
        priority: newEvent.priority,
        department: newEvent.department || null,
        assigned_to: newEvent.assignedTo.length > 0 ? JSON.stringify(newEvent.assignedTo) : null,
        assigned_by: null,
        deadline: newEvent.deadline || null,
        date: newEvent.date,
      } as any);
      if (error) throw error;
      toast.success('Event added!');
      setShowAddEvent(false);
      setNewEvent({
        title: '',
        type: 'task',
        time: '',
        details: '',
        priority: 'medium',
        department: '',
        assignedTo: [],
        deadline: '',
        date: ''
      });
      fetchEvents();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update event status in Supabase
  const handleEventStatusChange = async (eventId: string, newStatus: 'completed' | 'cancelled') => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('calendar_events')
        .update({ status: newStatus } as any)
        .eq('id', eventId as any);
      if (error) throw error;
      toast.success('Event updated!');
      fetchEvents();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete event from Supabase
  const handleDeleteEvent = async (eventId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId as any);
      if (error) throw error;
      toast.success('Event deleted!');
      fetchEvents();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter events by status
  const allActiveEvents = Object.values(events).flat();
  const activeEvents = allActiveEvents.filter(e => e.status !== 'completed' && e.status !== 'cancelled');
  const completedEvents = allActiveEvents.filter(e => e.status === 'completed');
  const cancelledEvents = allActiveEvents.filter(e => e.status === 'cancelled');
  const completedCount = completedEvents.length;
  const cancelledCount = cancelledEvents.length;

  // Filter events for calendar display (only active events)
  const activeEventsOnly: { [key: string]: CalendarEvent[] } = {};
  Object.keys(events).forEach(dateKey => {
    const dayActiveEvents = events[dateKey].filter(e => e.status !== 'completed' && e.status !== 'cancelled');
    if (dayActiveEvents.length > 0) {
      activeEventsOnly[dateKey] = dayActiveEvents;
    }
  });

  const getEventColor = (type: string, status: string, priority: string) => {
    if (status === 'completed') return 'bg-green-50 border-l-4 border-l-green-400';
    if (status === 'cancelled') return 'bg-red-50 border-l-4 border-l-red-400';
    
    switch (type) {
      case 'delivery': return 'bg-orange-50 border-l-4 border-l-orange-400';
      case 'task': return 'bg-blue-50 border-l-4 border-l-blue-400';
      case 'event': return 'bg-purple-50 border-l-4 border-l-purple-400';
      case 'production': return 'bg-indigo-50 border-l-4 border-l-indigo-400';
      case 'payment': return 'bg-yellow-50 border-l-4 border-l-yellow-400';
      case 'meeting': return 'bg-pink-50 border-l-4 border-l-pink-400';
      case 'quality': return 'bg-emerald-50 border-l-4 border-l-emerald-400';
      default: return 'bg-gray-50 border-l-4 border-l-gray-400';
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'delivery': return 'bg-orange-500 text-white';
      case 'task': return 'bg-blue-500 text-white';
      case 'event': return 'bg-purple-500 text-white';
      case 'production': return 'bg-indigo-500 text-white';
      case 'payment': return 'bg-yellow-500 text-white';
      case 'meeting': return 'bg-pink-500 text-white';
      case 'quality': return 'bg-emerald-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getPriorityDot = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getAvatarUrl = (employee: {id: string, name: string, avatar_url?: string | null}) => {
    if (employee.avatar_url) {
      return employee.avatar_url;
    }
    
    // Fallback to placeholder images based on name
    const avatars = [
      'photo-1581092795360-fd1ca04f0952',
      'photo-1485827404703-89b55fcc595e',
      'photo-1581091226825-a6a2a5aee158',
      'photo-1501286353178-1ec881214838'
    ];
    const index = employee.name.charCodeAt(0) % avatars.length;
    return `https://images.unsplash.com/${avatars[index]}?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=40&h=40&q=80`;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleDragStart = (e: React.DragEvent, event: CalendarEvent, sourceDate: string) => {
    console.log('Drag started:', { eventId: event.id, eventTitle: event.title, sourceDate });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ event, sourceDate }));
  };

  const handleDrop = async (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const data = e.dataTransfer.getData('application/json');
    if (!data) {
      console.log('No drag data found');
      return;
    }
    
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch (err) {
      console.error('Error parsing drag data:', err);
      return;
    }
    
    const { event, sourceDate } = parsedData;
    
    console.log('Drag and drop:', { 
      eventId: event.id, 
      eventTitle: event.title, 
      sourceDate, 
      targetDate,
      sourceEqualsTarget: sourceDate === targetDate
    });
    
    if (sourceDate === targetDate) {
      console.log('Source and target are the same, ignoring');
      return;
    }

    // Get the original ID (remove any -moved- suffix if present)
    const originalId = event.id.split('-moved-')[0];
    
    // Convert targetDate string (which is from toDateString()) back to a proper date
    // targetDate is in format like "Mon Nov 10 2025" or the "today" variable (which is also a toDateString())
    let targetDateObj: Date;
    let targetDateKey: string;
    
    // Check if targetDate matches today's date string
    const todayDateString = new Date().toDateString();
    
    if (targetDate === today || targetDate === todayDateString) {
      // If target is "today", use current date
      targetDateObj = new Date();
      targetDateObj.setHours(0, 0, 0, 0);
      // Use today's date string directly to ensure exact match
      targetDateKey = todayDateString;
    } else {
      // Parse the date string - toDateString() format: "Mon Nov 10 2025"
      targetDateObj = new Date(targetDate);
      if (isNaN(targetDateObj.getTime())) {
        console.error('Invalid target date:', targetDate);
        toast.error('Invalid date');
        return;
      }
      targetDateObj.setHours(0, 0, 0, 0);
      targetDateKey = targetDateObj.toDateString();
    }
    
    // Format as YYYY-MM-DD for database (use local date, not UTC, to avoid timezone issues)
    const year = targetDateObj.getFullYear();
    const month = String(targetDateObj.getMonth() + 1).padStart(2, '0');
    const day = String(targetDateObj.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    console.log('Date conversion:', {
      targetDate,
      targetDateObj: targetDateObj.toISOString(),
      formattedDate,
      targetDateKey
    });
    
    try {
      // Update local state first for immediate UI feedback
      setEvents(prev => {
        const newEvents = { ...prev };
        
        // Remove from source
        if (newEvents[sourceDate]) {
          newEvents[sourceDate] = newEvents[sourceDate].filter(e => {
            const eOriginalId = e.id.split('-moved-')[0];
            return eOriginalId !== originalId;
          });
          
          // Clean up empty arrays
          if (newEvents[sourceDate].length === 0) {
            delete newEvents[sourceDate];
          }
        }
        
        // Remove from target if it already exists there (to prevent duplicates)
        if (newEvents[targetDateKey]) {
          newEvents[targetDateKey] = newEvents[targetDateKey].filter(e => {
            const eOriginalId = e.id.split('-moved-')[0];
            return eOriginalId !== originalId;
          });
        }
        
        // Add to target
        if (!newEvents[targetDateKey]) {
          newEvents[targetDateKey] = [];
        }
        newEvents[targetDateKey].push({ ...event, id: originalId });
        
        console.log('State updated:', {
          sourceDate,
          targetDateKey,
          sourceEvents: newEvents[sourceDate]?.length || 0,
          targetEvents: newEvents[targetDateKey]?.length || 0,
          allDateKeys: Object.keys(newEvents),
          eventAdded: newEvents[targetDateKey]?.find(e => e.id === originalId)?.title
        });
        
        return newEvents;
      });
      
      // Update the event date in the database
      console.log('Updating database:', { originalId, formattedDate });
      const { error, data: updateData } = await supabase
        .from('calendar_events')
        .update({ date: formattedDate } as any)
        .eq('id', originalId as any)
        .select();
      
      if (error) {
        console.error('Error updating event date in database:', error);
        toast.error(`Failed to update event date: ${error.message}`);
        
        // Revert the state change on error
        console.log('Reverting state due to error');
        await fetchEvents();
        return;
      }
      
      console.log('Database updated successfully:', updateData);
      toast.success(`Event moved to ${targetDateObj.toLocaleDateString()}`);
      
      // Refresh events after a short delay to sync with database
      // This ensures we have the latest data, but the UI is already updated from state
      setTimeout(async () => {
        console.log('Refreshing events from database...');
        try {
          await fetchEvents();
          console.log('Events refreshed successfully');
        } catch (err) {
          console.error('Error refreshing events after move:', err);
        }
      }, 300);
      
    } catch (err: any) {
      console.error('Error moving event:', err);
      toast.error(`Failed to move event: ${err.message}`);
      
      // Revert on error
      await fetchEvents();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const getNext7Days = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const next7Days = getNext7Days();
  const today = new Date().toDateString();

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'active' | 'completed' | 'cancelled')}>
        <div className="flex items-center justify-between">
          <TabsList className="grid w-fit grid-cols-3">
            <TabsTrigger value="active" className="flex items-center gap-2 px-6">
              <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <div className="text-xs text-muted-foreground">Total Items</div>
                <div className="text-lg font-bold">{activeEvents.length}</div>
              </div>
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2 px-6">
              <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-left">
                <div className="text-xs text-muted-foreground">Completed</div>
                <div className="text-lg font-bold text-green-600">{completedCount}</div>
              </div>
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="flex items-center gap-2 px-6">
              <div className="w-8 h-8 bg-red-100 rounded flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-left">
                <div className="text-xs text-muted-foreground">Cancelled</div>
                <div className="text-lg font-bold text-red-600">{cancelledCount}</div>
              </div>
            </TabsTrigger>
          </TabsList>

          <Dialog open={showAddEvent} onOpenChange={setShowAddEvent}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Event</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter event title"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="type">Type</Label>
                    <Select value={newEvent.type} onValueChange={(value) => setNewEvent(prev => ({ ...prev, type: value as CalendarEvent['type'] }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="task">Task</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="quality">Quality Check</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={newEvent.priority} onValueChange={(value) => setNewEvent(prev => ({ ...prev, priority: value as CalendarEvent['priority'] }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="date">Date *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={newEvent.date}
                      onChange={(e) => setNewEvent(prev => ({ ...prev, date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="time">Time</Label>
                    <Input
                      id="time"
                      type="time"
                      value={newEvent.time}
                      onChange={(e) => setNewEvent(prev => ({ ...prev, time: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="department">Department</Label>
                    <Select value={newEvent.department} onValueChange={(value) => setNewEvent(prev => ({ ...prev, department: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="assignedTo">Assign To</Label>
                    <Select 
                      value={newEvent.assignedTo.length > 0 ? newEvent.assignedTo[0] : ""} 
                      onValueChange={(value) => {
                        if (value && !newEvent.assignedTo.includes(value)) {
                          setNewEvent(prev => ({ ...prev, assignedTo: [...prev.assignedTo, value] }));
                        }
                      }}
                      disabled={!newEvent.department}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={newEvent.department ? "Select employee" : "Select department first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredEmployees.filter(emp => !newEvent.assignedTo.includes(emp.id)).map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.name} ({employee.department})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                    {/* Display selected employees */}
                    {newEvent.assignedTo.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm text-muted-foreground">Assigned employees:</p>
                        <div className="flex flex-wrap gap-1">
                          {newEvent.assignedTo.map((empId) => {
                            const employee = employees.find(emp => emp.id === empId);
                            return (
                              <div key={empId} className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md text-sm">
                                <span>{employee?.name || 'Unknown'}</span>
                                <button
                                  type="button"
                                  onClick={() => setNewEvent(prev => ({ 
                                    ...prev, 
                                    assignedTo: prev.assignedTo.filter(id => id !== empId) 
                                  }))}
                                  className="text-primary hover:text-primary/70 ml-1"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="deadline">Deadline (Optional)</Label>
                  <Input
                    id="deadline"
                    type="datetime-local"
                    value={newEvent.deadline}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, deadline: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="details">Details</Label>
                  <Textarea
                    id="details"
                    value={newEvent.details}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, details: e.target.value }))}
                    placeholder="Enter event details"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddEvent} className="flex-1" disabled={loading}>
                    {loading ? 'Adding...' : 'Add Event'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddEvent(false)} className="flex-1" disabled={loading}>
                    {loading ? 'Cancelling...' : 'Cancel'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <TabsContent value="active" className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold flex items-center gap-3">
                <Calendar className="w-8 h-8 text-primary" />
                Calendar View
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Schedule overview for all processes and events.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Eye className="w-4 h-4 mr-2" />
                Switch to Dashboard
              </Button>
            </div>
          </div>

          {/* Calendar Instructions */}
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="w-4 h-4" />
              <span>7-Day Schedule Calendar</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              Drag and drop events to reschedule. All processes, deliveries, and payments at a glance.
            </p>
          </div>

          {/* Today's View - Large Card */}
          {(() => {
            const todayEvents = activeEventsOnly[today] || [];
            const todayDate = new Date();
            
            return (
              <Card 
                className="w-full mb-6 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10"
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDrop(e, today);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDragOver(e);
                }}
              >
                <CardHeader className="pb-4">
                  <CardTitle className="text-center">
                    <div className="text-xl font-bold text-primary mb-1">
                      Today - {todayDate.toLocaleDateString('en-US', { weekday: 'long' })}
                    </div>
                    <div className="text-6xl font-bold text-primary my-2">
                      {todayDate.getDate()}
                    </div>
                    <div className="text-lg text-muted-foreground">
                      {todayDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 min-h-[200px]">
                  {loading ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">Loading events...</p>
                    </div>
                  ) : error ? (
                    <div className="text-center py-12 text-red-500">
                      Error: {error}
                    </div>
                  ) : todayEvents.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {todayEvents
                        .sort((a, b) => {
                          const timeA = a.time || '';
                          const timeB = b.time || '';
                          return timeA.localeCompare(timeB);
                        })
                        .map((event) => (
                          <div
                            key={event.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, event, today)}
                            onClick={() => setSelectedEvent(event)}
                            className={`p-3 rounded-lg border cursor-move hover:shadow-md transition-all ${getEventColor(event.type, event.status, event.priority)}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <Badge className={`text-xs px-2 py-0.5 ${getTypeBadgeColor(event.type)}`}>
                                {event.type.toUpperCase()}
                              </Badge>
                              <div className={`w-2.5 h-2.5 rounded-full ${getPriorityDot(event.priority)}`}></div>
                            </div>
                            <p className="text-sm font-semibold text-foreground mb-2 line-clamp-2">
                              {event.title}
                            </p>
                            {event.assignedEmployees && event.assignedEmployees.length > 0 && (
                              <div className="flex items-center gap-2 mb-2">
                                <Avatar className="w-6 h-6">
                                  <AvatarImage src={getAvatarUrl(event.assignedEmployees[0])} alt={event.assignedEmployees[0].name} />
                                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                    {getInitials(event.assignedEmployees[0].name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground">
                                  {event.assignedEmployees[0].name}
                                  {event.assignedEmployees.length > 1 && ` +${event.assignedEmployees.length - 1}`}
                                </span>
                              </div>
                            )}
                            {event.time && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                <span>{event.time}</span>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-12">
                      <CalendarDays className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium">No events scheduled for today.</p>
                      <p className="text-sm mt-1">Perfect time to plan your day!</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* 7-Day Schedule - Vertical Columns */}
          <div className="grid grid-cols-7 gap-3">
            {next7Days.slice(1).map((date) => {
              const dateKey = date.toDateString();
              const dayEvents = activeEventsOnly[dateKey] || [];
              const isToday = dateKey === today;
              
              return (
                <div
                  key={dateKey}
                  className={`flex flex-col min-h-[500px] rounded-lg border-2 p-3 transition-all ${
                    isToday ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
                  }`}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDrop(e, dateKey);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDragOver(e);
                  }}
                >
                  {/* Day Header */}
                  <div className="mb-3 pb-2 border-b">
                    <div className="text-xs font-medium text-muted-foreground uppercase">
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className="text-2xl font-bold mt-1">
                      {date.getDate()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    {dayEvents.length > 0 && (
                      <Badge variant="secondary" className="mt-2 text-xs">
                        {dayEvents.length}
                      </Badge>
                    )}
                  </div>

                  {/* Events List */}
                  <div className="flex-1 space-y-2">
                    {dayEvents.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        <CalendarDays className="w-6 h-6 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No events</p>
                      </div>
                    ) : (
                      dayEvents
                        .sort((a, b) => {
                          const timeA = a.time || '';
                          const timeB = b.time || '';
                          return timeA.localeCompare(timeB);
                        })
                        .map((event) => (
                          <div
                            key={event.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, event, dateKey)}
                            onClick={() => setSelectedEvent(event)}
                            className={`p-3 rounded-lg border cursor-move hover:shadow-md transition-all group ${getEventColor(event.type, event.status, event.priority)}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <Badge className={`text-xs px-1.5 py-0.5 ${getTypeBadgeColor(event.type)}`}>
                                {event.type.substring(0, 3).toUpperCase()}
                              </Badge>
                              <div className={`w-2 h-2 rounded-full ${getPriorityDot(event.priority)} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                            </div>
                            <p className="text-xs font-semibold text-foreground mb-2 line-clamp-2">
                              {event.title}
                            </p>
                            {event.assignedEmployees && event.assignedEmployees.length > 0 && (
                              <div className="flex items-center gap-1.5 mb-1">
                                <Avatar className="w-5 h-5">
                                  <AvatarImage src={getAvatarUrl(event.assignedEmployees[0])} alt={event.assignedEmployees[0].name} />
                                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                    {getInitials(event.assignedEmployees[0].name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground truncate">
                                  {event.assignedEmployees[0].name}
                                </span>
                              </div>
                            )}
                            {event.time && (
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                <span>{event.time}</span>
                              </div>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Completed Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedEvents.map((event) => (
                  <div key={event.id} className="p-4 bg-green-50 border border-green-200 rounded-lg hover-scale">
                    <div className="flex items-start justify-between mb-2">
                      <Badge className="bg-green-100 text-green-800">
                        {event.type.toUpperCase()}
                      </Badge>
                      <Badge className="bg-green-100 text-green-800">Completed</Badge>
                    </div>
                    <p className="font-semibold text-green-900 mb-1">{event.title}</p>
                    <div className="flex items-center justify-between text-sm text-green-700 mb-2">
                      <span>{event.time || 'No time'}</span>
                      {event.department && <span>• {event.department}</span>}
                    </div>
                    {event.assignedEmployees && event.assignedEmployees.length > 0 && (
                      <div className="mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {event.assignedEmployees.map((emp) => (
                            <div key={emp.id} className="flex items-center gap-1.5">
                              <Avatar className="w-5 h-5">
                                <AvatarImage src={getAvatarUrl(emp)} alt={emp.name} />
                                <AvatarFallback className="text-[10px] bg-green-100 text-green-800">
                                  {getInitials(emp.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-green-800">{emp.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-green-600 line-clamp-2">{event.details || 'No details'}</p>
                  </div>
                ))}
                {completedEvents.length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground py-12">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No completed tasks yet</p>
                    <p className="text-sm">Completed tasks will appear here</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cancelled" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                Cancelled Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cancelledEvents.map((event) => (
                  <div key={event.id} className="p-4 bg-red-50 border border-red-200 rounded-lg hover-scale">
                    <div className="flex items-start justify-between mb-2">
                      <Badge className="bg-red-100 text-red-800">
                        {event.type.toUpperCase()}
                      </Badge>
                      <Badge className="bg-red-100 text-red-800">Cancelled</Badge>
                    </div>
                    <p className="font-semibold text-red-900 mb-1">{event.title}</p>
                    <div className="flex items-center justify-between text-sm text-red-700 mb-2">
                      <span>{event.time || 'No time'}</span>
                      {event.department && <span>• {event.department}</span>}
                    </div>
                    {event.assignedEmployees && event.assignedEmployees.length > 0 && (
                      <div className="mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {event.assignedEmployees.map((emp) => (
                            <div key={emp.id} className="flex items-center gap-1.5">
                              <Avatar className="w-5 h-5">
                                <AvatarImage src={getAvatarUrl(emp)} alt={emp.name} />
                                <AvatarFallback className="text-[10px] bg-red-100 text-red-800">
                                  {getInitials(emp.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-red-800">{emp.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-red-600 line-clamp-2">{event.details || 'No details'}</p>
                  </div>
                ))}
                {cancelledEvents.length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground py-12">
                    <XCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No cancelled tasks</p>
                    <p className="text-sm">Cancelled tasks will appear here</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge className={`${getTypeBadgeColor(selectedEvent?.type || '')}`}>
                {selectedEvent?.type.toUpperCase()}
              </Badge>
              {selectedEvent?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Time</Label>
                  <p className="text-sm text-muted-foreground">{selectedEvent.time}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Priority</Label>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getPriorityDot(selectedEvent.priority)}`}></div>
                    <span className="text-sm text-muted-foreground capitalize">{selectedEvent.priority}</span>
                  </div>
                </div>
              </div>
              {selectedEvent.department && (
                <div>
                  <Label className="text-sm font-medium">Department</Label>
                  <p className="text-sm text-muted-foreground">{selectedEvent.department}</p>
                </div>
              )}
              {selectedEvent.assignedEmployees && selectedEvent.assignedEmployees.length > 0 && (
                <div>
                  <Label className="text-sm font-medium">Assigned To</Label>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {selectedEvent.assignedEmployees.map((emp) => (
                      <div key={emp.id} className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={getAvatarUrl(emp)} alt={emp.name} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {getInitials(emp.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{emp.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label className="text-sm font-medium">Status</Label>
                <Badge variant="outline" className="ml-2 capitalize">
                  {selectedEvent.status}
                </Badge>
              </div>
              <div>
                <Label className="text-sm font-medium">Details</Label>
                <p className="text-sm text-muted-foreground">{selectedEvent.details}</p>
              </div>
              {selectedEvent.status === 'pending' && (
                <div className="flex gap-2 mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => handleEventStatusChange(selectedEvent.id, 'cancelled')}
                    className="flex-1"
                    disabled={loading}
                  >
                    {loading ? 'Cancelling...' : 'Cancel Task'}
                  </Button>
                  <Button 
                    onClick={() => handleEventStatusChange(selectedEvent.id, 'completed')}
                    className="flex-1"
                    disabled={loading}
                  >
                    {loading ? 'Marking...' : 'Mark Complete'}
                  </Button>
                </div>
              )}
              <Button variant="outline" onClick={() => handleDeleteEvent(selectedEvent.id)} className="flex-1" disabled={loading}>
                {loading ? 'Deleting...' : 'Delete Event'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
