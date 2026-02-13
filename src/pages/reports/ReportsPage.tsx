import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Download, FileText, BarChart3, PieChart, TrendingUp, Users, Package, DollarSign, Clock, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ErpLayout } from '@/components/ErpLayout';
import { BackButton } from '@/components/common/BackButton';

const ReportsPage = () => {
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [reportType, setReportType] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [productFilter, setProductFilter] = useState<string>('');

  const reportTypes = [
    { value: 'sales', label: 'Sales Report', icon: DollarSign, description: 'Revenue and sales performance' },
    { value: 'orders', label: 'Orders Report', icon: Package, description: 'Order status and fulfillment' },
    { value: 'customers', label: 'Customer Report', icon: Users, description: 'Customer analytics and insights' },
    { value: 'inventory', label: 'Inventory Report', icon: Package, description: 'Stock levels and movements' },
    { value: 'production', label: 'Production Report', icon: TrendingUp, description: 'Production efficiency and output' },
    { value: 'quality', label: 'Quality Report', icon: BarChart3, description: 'Quality metrics and defects' },
    { value: 'financial', label: 'Financial Report', icon: FileText, description: 'Financial statements and P&L' },
    { value: 'performance', label: 'Performance Report', icon: PieChart, description: 'Overall business performance' }
  ];

  const handleGenerateReport = () => {
    // TODO: Implement report generation logic
    console.log('Generating report:', {
      reportType,
      dateFrom,
      dateTo,
      customerFilter,
      productFilter
    });
  };

  const handleExportReport = (format: string) => {
    // TODO: Implement export functionality
    console.log(`Exporting report as ${format}`);
  };

  return (
    <ErpLayout>
    <div className="w-full space-y-6">
        <div className="flex items-center">
          <BackButton to="/dashboard" label="Back to Dashboard" />
        </div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">
            Generate and export comprehensive business reports
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Clock className="h-4 w-4 mr-2" />
            Schedule Report
          </Button>
          <Button size="sm">
            <Download className="h-4 w-4 mr-2" />
            Quick Export
          </Button>
        </div>
      </div>

      {/* Report Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Report Filters
          </CardTitle>
          <CardDescription>
            Configure your report parameters and filters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Report Type */}
            <div className="space-y-2">
              <Label htmlFor="report-type">Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  {reportTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center">
                        <type.icon className="h-4 w-4 mr-2" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="space-y-2">
              <Label>Date From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Date To */}
            <div className="space-y-2">
              <Label>Date To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Customer Filter */}
            <div className="space-y-2">
              <Label htmlFor="customer-filter">Customer</Label>
              <Input
                id="customer-filter"
                placeholder="Filter by customer"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button onClick={handleGenerateReport} className="flex items-center">
              <BarChart3 className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
            <Button variant="outline" onClick={() => {
              setDateFrom(undefined);
              setDateTo(undefined);
              setReportType('');
              setCustomerFilter('');
              setProductFilter('');
            }}>
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {reportTypes.map((type) => (
          <Card key={type.value} className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <type.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">{type.label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                {type.description}
              </CardDescription>
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setReportType(type.value)}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Generate
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleExportReport('PDF')}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Reports Section */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Reports</CardTitle>
          <CardDescription>
            Pre-configured reports for common business needs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h4 className="font-medium">Monthly Sales</h4>
                  <p className="text-sm text-muted-foreground">Current month revenue</p>
                </div>
              </div>
            </div>
            
            <div className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-medium">Pending Orders</h4>
                  <p className="text-sm text-muted-foreground">Orders awaiting fulfillment</p>
                </div>
              </div>
            </div>
            
            <div className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <h4 className="font-medium">Production Status</h4>
                  <p className="text-sm text-muted-foreground">Current production metrics</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
          <CardDescription>
            Your recently generated reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h4 className="font-medium">Sales Report - October 2024</h4>
                  <p className="text-sm text-muted-foreground">Generated 2 hours ago</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button size="sm" variant="outline">
                  View
                </Button>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-3">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h4 className="font-medium">Inventory Report - Q3 2024</h4>
                  <p className="text-sm text-muted-foreground">Generated 1 day ago</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button size="sm" variant="outline">
                  View
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    </ErpLayout>
  );
};

export default ReportsPage;
