import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import "@/pages/OrdersPageViewSwitch.css";
import { Users, Award, TrendingUp, UserPlus, Scissors, Palette, UserCheck } from "lucide-react";
import { EmployeeCardList } from "@/components/people/EmployeeCardList";
import { ProductionTeamList } from "@/components/people/ProductionTeamList";
import { getDepartmentCount } from "@/lib/database";
import { useState, useEffect } from "react";

const PeoplePage = () => {
  const [peopleTab, setPeopleTab] = useState<'employees' | 'production-team'>('employees');
  const [departmentCount, setDepartmentCount] = useState<number>(0);

  useEffect(() => {
    const fetchDepartmentCount = async () => {
      try {
        const count = await getDepartmentCount();
        setDepartmentCount(count);
      } catch (error) {
        console.error('Error fetching department count:', error);
      }
    };

    fetchDepartmentCount();
  }, []);

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            People Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your workforce, production team, and organizational structure
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">50</div>
              <p className="text-xs text-muted-foreground">
                +2 from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Production Team</CardTitle>
              <Scissors className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">25</div>
              <p className="text-xs text-muted-foreground">
                Cutters and Tailors
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Today</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">70</div>
              <p className="text-xs text-muted-foreground">
                93% attendance rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Departments</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{departmentCount}</div>
              <p className="text-xs text-muted-foreground">
                Across all operations
              </p>
            </CardContent>
          </Card>
        </div>

        <label
          htmlFor="people-page-view-switch"
          className="orders-view-switch"
          aria-label="Switch between employees and production team"
        >
          <input
            id="people-page-view-switch"
            type="checkbox"
            role="switch"
            aria-checked={peopleTab === 'production-team'}
            checked={peopleTab === 'production-team'}
            onChange={(e) => setPeopleTab(e.target.checked ? 'production-team' : 'employees')}
          />
          <span className="flex items-center justify-center gap-2">
            <Users className="h-4 w-4 shrink-0" />
            Employees
          </span>
          <span className="flex items-center justify-center gap-2">
            <Scissors className="h-4 w-4 shrink-0" />
            Production Team
          </span>
        </label>

          {peopleTab === 'employees' && (
          <div className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Employee Directory
                </CardTitle>
                <CardDescription>
                  Manage employee directory, profiles, and organizational structure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EmployeeCardList />
              </CardContent>
            </Card>
          </div>
          )}

          {peopleTab === 'production-team' && (
          <div className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scissors className="h-5 w-5" />
                  Production Team
                </CardTitle>
                <CardDescription>
                  Manage cutting managers and tailors
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProductionTeamList />
              </CardContent>
            </Card>
          </div>
          )}
      </div>
    </ErpLayout>
  );
};

export default PeoplePage;