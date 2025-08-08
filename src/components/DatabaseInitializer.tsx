import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Database, RefreshCw, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { initializeDatabase, clearDatabase, isDatabaseEmpty } from '@/lib/seedData';

export function DatabaseInitializer() {
  const [isLoading, setIsLoading] = useState(false);
  const [isEmpty, setIsEmpty] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const checkDatabaseStatus = async () => {
    try {
      setIsLoading(true);
      const empty = await isDatabaseEmpty();
      setIsEmpty(empty);
      setMessage({
        type: 'info',
        text: empty ? 'Database is empty and ready for seeding.' : 'Database contains data.'
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error checking database status.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedDatabase = async () => {
    try {
      setIsLoading(true);
      await initializeDatabase();
      setIsEmpty(false);
      setMessage({
        type: 'success',
        text: 'Database seeded successfully with sample data!'
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error seeding database.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
      return;
    }

    try {
      setIsLoading(true);
      await clearDatabase();
      setIsEmpty(true);
      setMessage({
        type: 'success',
        text: 'Database cleared successfully!'
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error clearing database.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Database Initializer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This tool helps you initialize the database with sample data for development and testing purposes.
        </p>

        {message && (
          <Alert className={message.type === 'error' ? 'border-red-200 bg-red-50' : 
                           message.type === 'success' ? 'border-green-200 bg-green-50' : 
                           'border-blue-200 bg-blue-50'}>
            {message.type === 'success' ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : message.type === 'error' ? (
              <AlertCircle className="h-4 w-4 text-red-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-blue-600" />
            )}
            <AlertDescription className={message.type === 'error' ? 'text-red-800' : 
                                       message.type === 'success' ? 'text-green-800' : 
                                       'text-blue-800'}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={checkDatabaseStatus}
            disabled={isLoading}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Check Status
          </Button>

          <Button
            onClick={handleSeedDatabase}
            disabled={isLoading || isEmpty === false}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
          >
            <Database className="w-4 h-4" />
            Seed Database
          </Button>

          <Button
            onClick={handleClearDatabase}
            disabled={isLoading || isEmpty === true}
            variant="destructive"
            className="flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear Database
          </Button>
        </div>

        {isEmpty !== null && (
          <div className="text-sm text-muted-foreground">
            <strong>Database Status:</strong> {isEmpty ? 'Empty' : 'Contains Data'}
          </div>
        )}

        <div className="text-xs text-muted-foreground border-t pt-4">
          <strong>Note:</strong> This tool is for development purposes only. 
          Sample data includes customers, products, employees, fabrics, and other master data.
        </div>
      </CardContent>
    </Card>
  );
} 