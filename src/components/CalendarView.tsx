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
  XCircle
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
  assignedEmployees?: Array<{id: string, name: string}>; // For display purposes
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
  const [employees, setEmployees] = useState<Array<{id: string, name: string, department: string}>>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Array<{id: string, name: string, department: string}>>([]);
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
        let assignedEmployees: Array<{id: string, name: string}> = [];
        
        if (event.assigned_to) {
          try {
            // Try to parse as JSON array first
            assignedToIds = JSON.parse(event.assigned_to);
          } catch {
            // If not JSON, treat as single value
            assignedToIds = [event.assigned_to];
          }
          
          // Get employee names for display
          assignedEmployees = assignedToIds.map((id: string) => {
            const employee = employees.find(emp => emp.id === id);
            return {
              id,
              name: employee ? employee.name : 'Unknown Employee'
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
        .select('id, full_name, department')
        .order('full_name');
      
      if (error) {
        console.error('Error fetching employees:', error);
        toast.error('Failed to load employees');
      } else if (data && !Array.isArray(data) === false) {
        const employeeList = (data as any[]).map(emp => ({
          id: emp.id,
          name: emp.full_name,
          department: emp.department || 'Unknown'
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

  const handleDragStart = (e: React.DragEvent, event: CalendarEvent, sourceDate: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ event, sourceDate }));
  };

  const handleDrop = (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    
    const { event, sourceDate } = JSON.parse(data);
    
    if (sourceDate === targetDate) return;

    setEvents(prev => {
      const newEvents = { ...prev };
      
      // Get the original ID (remove any -moved- suffix if present)
      const originalId = event.id.split('-moved-')[0];
      
      // Remove from source - check both original ID and any moved ID variations
      newEvents[sourceDate] = newEvents[sourceDate]?.filter(e => {
        const eOriginalId = e.id.split('-moved-')[0];
        return eOriginalId !== originalId;
      }) || [];
      
      // Remove from target if it already exists there (to prevent duplicates)
      newEvents[targetDate] = newEvents[targetDate]?.filter(e => {
        const eOriginalId = e.id.split('-moved-')[0];
        return eOriginalId !== originalId;
      }) || [];
      
      // Add to target with original ID (no need to create new ID)
      if (!newEvents[targetDate]) newEvents[targetDate] = [];
      newEvents[targetDate].push({ ...event, id: originalId });
      
      return newEvents;
    });
    
    toast.success(`Event moved to ${new Date(targetDate).toLocaleDateString()}`);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
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
          <div>
            <h2 className="text-3xl font-bold flex items-center">
              <Calendar className="w-8 h-8 mr-3 text-primary" />
              7-Day Schedule Calendar
            </h2>
            <p className="text-muted-foreground mt-2">
              Drag and drop events to reschedule. All processes, deliveries, and payments at a glance.
            </p>
          </div>

          {/* Today's Card - Full Width */}
          {(() => {
            const todayEvents = activeEventsOnly[today] || [];
            const isToday = true;
            
            return (
              <Card 
                className="w-full ring-2 ring-primary bg-primary/5 animate-fade-in"
                onDrop={(e) => handleDrop(e, today)}
                onDragOver={handleDragOver}
              >
                <CardHeader className="pb-4 bg-gradient-to-r from-primary/10 to-primary/5">
                  <CardTitle className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      Today - {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
                    </div>
                    <div className="text-4xl font-bold text-primary mt-2">
                      {new Date().getDate()}
                    </div>
                    <div className="text-lg text-muted-foreground">
                      {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                    {todayEvents.length > 0 && (
                      <div className="mt-3">
                        <Badge variant="secondary" className="text-sm">
                          {todayEvents.length} item{todayEvents.length !== 1 ? 's' : ''} scheduled
                        </Badge>
                      </div>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {loading ? (
                    <div className="text-center py-12">
                      <p>Loading events...</p>
                    </div>
                  ) : error ? (
                    <div className="text-center py-12 text-red-500">
                      Error: {error}
                    </div>
                  ) : todayEvents.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {todayEvents
                        .sort((a, b) => {
                          // Handle null/undefined time values
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
                            className={`p-4 rounded-lg border cursor-pointer hover:shadow-lg transition-all hover-scale ${getEventColor(event.type, event.status, event.priority)}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <Badge className={`text-xs px-2 py-1 ${getTypeBadgeColor(event.type)}`}>
                                {event.type.toUpperCase()}
                              </Badge>
                              <div className={`w-3 h-3 rounded-full ${getPriorityDot(event.priority)}`}></div>
                            </div>
                            <p className="text-sm font-semibold leading-tight text-foreground mb-2">
                              {event.title}
                            </p>
                            <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                              <span className="font-medium">{event.time || 'No time set'}</span>
                              {event.department && <span className="text-xs">• {event.department}</span>}
                            </div>
                            {event.assignedEmployees && event.assignedEmployees.length > 0 && (
                              <div className="mb-2">
                                <div className="flex flex-wrap gap-1">
                                  {event.assignedEmployees.slice(0, 2).map((emp) => (
                                    <span key={emp.id} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                      {emp.name}
                                    </span>
                                  ))}
                                  {event.assignedEmployees.length > 2 && (
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                      +{event.assignedEmployees.length - 2} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-tight">
                              {event.details || 'No details'}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-12">
                      <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">No events scheduled for today</p>
                      <p className="text-sm">Perfect time to plan your day!</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Other Days - Compact Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
            {next7Days.slice(1).map((date, index) => {
              const dateKey = date.toDateString();
              const dayEvents = activeEventsOnly[dateKey] || [];
              const isExpanded = expandedDate === dateKey;
              
              return (
                <Card 
                  key={dateKey}
                  className={`transition-all duration-300 cursor-pointer hover-scale ${
                    isExpanded ? 'md:col-span-2 lg:col-span-3' : ''
                  }`}
                  onClick={() => setExpandedDate(isExpanded ? null : dateKey)}
                  onDrop={(e) => handleDrop(e, dateKey)}
                  onDragOver={handleDragOver}
                >
                  <CardHeader className="pb-2 bg-muted/20">
                    <CardTitle className="text-center">
                      <div className="text-sm font-semibold">
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className="text-xl font-bold">
                        {date.getDate()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {date.toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                      {dayEvents.length > 0 && (
                        <div className="mt-1">
                          <Badge variant="outline" className="text-xs">
                            {dayEvents.length}
                          </Badge>
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    <div className="space-y-1">{/* Dynamic height for all events */}
                      {dayEvents
                        .sort((a, b) => {
                          // Handle null/undefined time values
                          const timeA = a.time || '';
                          const timeB = b.time || '';
                          return timeA.localeCompare(timeB);
                        })
                        .map((event) => (
                          <div
                            key={event.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, event, dateKey)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(event);
                            }}
                            className={`p-2 rounded border cursor-pointer hover:shadow-sm transition-all ${getEventColor(event.type, event.status, event.priority)} ${
                              isExpanded ? 'mb-2' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <Badge className={`text-xs px-1 py-0.5 ${getTypeBadgeColor(event.type)}`}>
                                {event.type.substring(0, 3).toUpperCase()}
                              </Badge>
                              <div className={`w-2 h-2 rounded-full ${getPriorityDot(event.priority)}`}></div>
                            </div>
                            <p className="text-xs font-medium leading-tight text-foreground mb-1 line-clamp-2">
                              {event.title}
                            </p>
                            {event.assignedEmployees && event.assignedEmployees.length > 0 && (
                              <div className="mb-1">
                                <div className="flex flex-wrap gap-1">
                                  {event.assignedEmployees.slice(0, 1).map((emp) => (
                                    <span key={emp.id} className="text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
                                      {emp.name}
                                    </span>
                                  ))}
                                  {event.assignedEmployees.length > 1 && (
                                    <span className="text-xs bg-gray-100 text-gray-600 px-1 py-0.5 rounded">
                                      +{event.assignedEmployees.length - 1}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            {isExpanded && (
                              <>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>{event.time || 'No time'}</span>
                                  {event.department && <span>• {event.department}</span>}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-tight">
                                  {event.details || 'No details'}
                                </p>
                              </>
                            )}
                          </div>
                        ))}
                      {dayEvents.length === 0 && (
                        <div className="text-center text-muted-foreground text-xs py-4">
                          <CalendarDays className="w-4 h-4 mx-auto mb-1 opacity-50" />
                          <p>No events</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
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
                        <div className="flex flex-wrap gap-1">
                          {event.assignedEmployees.map((emp) => (
                            <span key={emp.id} className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              {emp.name}
                            </span>
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
                        <div className="flex flex-wrap gap-1">
                          {event.assignedEmployees.map((emp) => (
                            <span key={emp.id} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                              {emp.name}
                            </span>
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
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedEvent.assignedEmployees.map((emp) => (
                      <Badge key={emp.id} variant="secondary" className="text-sm">
                        {emp.name}
                      </Badge>
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
