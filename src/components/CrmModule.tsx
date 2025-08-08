import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Plus, 
  Phone, 
  Mail, 
  MapPin, 
  Building, 
  Star,
  Filter,
  Download,
  Users
} from "lucide-react";
import { getCustomers, type Customers } from "@/lib/database";

export function CrmModule() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        const customersData = await getCustomers();
        setCustomers(customersData);
      } catch (error) {
        console.error('Error fetching customers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (customer.phone && customer.phone.includes(searchTerm));
    
    const matchesTier = selectedTier === "all" || (customer.customer_tier && customer.customer_tier.toLowerCase() === selectedTier.toLowerCase());
    
    return matchesSearch && matchesTier;
  });

  const tierCounts = {
    all: customers.length,
    gold: customers.filter(c => c.customer_tier === 'gold').length,
    silver: customers.filter(c => c.customer_tier === 'silver').length,
    bronze: customers.filter(c => c.customer_tier === 'bronze').length
  };

  const getTierColor = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'gold': return 'bg-yellow-100 text-yellow-800';
      case 'silver': return 'bg-gray-100 text-gray-800';
      case 'bronze': return 'bg-orange-100 text-orange-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const getVolumeColor = (volume: string) => {
    switch (volume.toLowerCase()) {
      case 'high': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 bg-muted rounded w-48"></div>
          <div className="h-10 bg-muted rounded w-32"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-muted rounded w-1/2"></div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">
            Customer Relationship Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your customer relationships and track business opportunities
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-erp-md">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Customers</p>
                <p className="text-2xl font-bold">{customers.length}</p>
              </div>
              <div className="p-2 bg-accent rounded-lg">
                <Users className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-erp-md">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gold Customers</p>
                <p className="text-2xl font-bold">{tierCounts.gold}</p>
              </div>
              <div className="p-2 bg-yellow-500 rounded-lg">
                <Star className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-erp-md">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding Amount</p>
                <p className="text-2xl font-bold">
                  ₹{Math.round(customers.reduce((sum, c) => sum + (c.outstanding_amount || 0), 0) / 1000)}K
                </p>
              </div>
              <div className="p-2 bg-red-500 rounded-lg">
                <Building className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-erp-md">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Credit Limit</p>
                <p className="text-2xl font-bold">
                  ₹{Math.round(customers.reduce((sum, c) => sum + (c.credit_limit || 0), 0) / 1000000)}M
                </p>
              </div>
              <div className="p-2 bg-green-500 rounded-lg">
                <Building className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="shadow-erp-md">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              {[
                { key: 'all', label: 'All', count: tierCounts.all },
                { key: 'gold', label: 'Gold', count: tierCounts.gold },
                { key: 'silver', label: 'Silver', count: tierCounts.silver },
                { key: 'bronze', label: 'Bronze', count: tierCounts.bronze }
              ].map(tier => (
                <Button
                  key={tier.key}
                  variant={selectedTier === tier.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTier(tier.key)}
                  className={selectedTier === tier.key ? "bg-gradient-primary" : ""}
                >
                  {tier.label} ({tier.count})
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.map((customer) => (
          <Card key={customer.id} className="shadow-erp-md hover:shadow-erp-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{customer.company_name}</CardTitle>
                  <p className="text-sm text-muted-foreground">ID: {customer.id}</p>
                </div>
                <div className="flex gap-2">
                  <Badge className={getTierColor(customer.customer_tier || '')}>
                    {customer.customer_tier || 'N/A'}
                  </Badge>
                  <Badge className={getVolumeColor(customer.customer_type || '')}>
                    {customer.customer_type || 'N/A'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center text-sm text-muted-foreground">
                <Phone className="w-4 h-4 mr-2" />
                {customer.phone || 'N/A'}
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <Mail className="w-4 h-4 mr-2" />
                {customer.email || 'N/A'}
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 mr-2" />
                {customer.city || 'N/A'}, {customer.state || 'N/A'}
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <Building className="w-4 h-4 mr-2" />
                GST: {customer.gstin}
              </div>
              
              <div className="pt-3 border-t space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">Total Orders</p>
                    <p className="text-lg font-bold">{customer.total_orders || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Outstanding</p>
                    <p className="text-lg font-bold text-red-600">
                      ₹{(customer.outstanding_amount || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">Credit Limit</p>
                    <p className="text-lg font-bold text-green-600">
                      ₹{(customer.credit_limit || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 pt-2">
                <Button size="sm" className="flex-1">
                  View Details
                </Button>
                <Button size="sm" variant="outline" className="flex-1">
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredCustomers.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No customers found</h3>
          <p className="text-muted-foreground">
            Try adjusting your search criteria or add a new customer.
          </p>
        </div>
      )}
    </div>
  );
}