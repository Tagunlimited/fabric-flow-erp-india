import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shirt, Clock, Construction } from "lucide-react";
import { useNavigate } from "react-router-dom";

const StockOrdersPage = () => {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Stock Orders</h1>
        <p className="text-gray-600 mt-2">Manage your stock orders and inventory</p>
      </div>

      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 p-4 bg-orange-100 rounded-full w-20 h-20 flex items-center justify-center">
              <Construction className="w-10 h-10 text-orange-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Coming Soon
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center text-gray-600">
              <Shirt className="w-6 h-6 mr-2" />
              <span className="text-lg">Stock Orders Management</span>
            </div>
            <p className="text-gray-500">
              We're working hard to bring you a comprehensive stock orders management system. 
              This feature will allow you to:
            </p>
            <ul className="text-left text-gray-600 space-y-2">
              <li className="flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                Create and manage stock orders
              </li>
              <li className="flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                Track inventory levels
              </li>
              <li className="flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                Monitor order status and fulfillment
              </li>
              <li className="flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                Generate reports and analytics
              </li>
            </ul>
            <div className="flex items-center justify-center text-orange-600 mt-6">
              <Clock className="w-5 h-5 mr-2" />
              <span className="font-medium">Stay tuned for updates!</span>
            </div>
            <Button 
              onClick={() => navigate('/orders')}
              className="w-full mt-6"
            >
              View Custom Orders
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StockOrdersPage;
