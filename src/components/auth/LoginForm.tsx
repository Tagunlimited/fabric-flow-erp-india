import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import './LoginGlass.css';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Load remembered email on component mount
  useEffect(() => {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    const rememberedPassword = localStorage.getItem('rememberedPassword');
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
    if (rememberedPassword) {
      setPassword(rememberedPassword);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // CRITICAL: Clear any existing session first to prevent user confusion
      // This ensures we start with a clean slate and the correct user is loaded
      console.log('🔐 Clearing any existing session before login...');
      await supabase.auth.signOut();
      
      // Small delay to ensure sign out completes
      await new Promise(resolve => setTimeout(resolve, 100));

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (data.user) {
        // Verify we got the correct user
        console.log('✅ Login successful for user:', { 
          id: data.user.id, 
          email: data.user.email,
          expectedEmail: email 
        });
        
        // Double-check the email matches (security check)
        if (data.user.email?.toLowerCase() !== email.toLowerCase()) {
          console.error('❌ Email mismatch!', { 
            expected: email, 
            actual: data.user.email 
          });
          await supabase.auth.signOut();
          throw new Error('Login failed: User mismatch detected');
        }

        // Handle remember me functionality
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
          localStorage.setItem('rememberedPassword', password);
        } else {
          localStorage.removeItem('rememberedEmail');
          localStorage.removeItem('rememberedPassword');
        }

        // Check if user is approved (skip for pre-configured admin)
        if (email !== 'ecom@tagunlimitedclothing.com') {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('status')
            .eq('user_id', data.user.id as any)
            .single();

          if (profileError) {
            throw new Error('Failed to fetch user profile');
          }

          // Type guard to ensure profile is not an error
          if (profile && typeof profile === 'object' && 'status' in profile) {
            if (profile.status !== 'approved') {
              throw new Error('Account pending admin approval');
            }
          }
        }

        toast.success('Login successful!');
        
        // Clear any cached auth state to force fresh load
        localStorage.removeItem('login_timestamp');
        // Clear redirect flag to allow fresh redirect on login
        sessionStorage.removeItem('permissionRedirectDone');
        
        // Use window.location.href for reliable navigation after login
        // This ensures a full page reload which properly initializes auth state
        // and avoids race conditions with React Router navigation
        setTimeout(() => {
          window.location.href = '/';
        }, 500); // Small delay to ensure toast is visible
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
      toast.error(err.message || 'Login failed');
      // Ensure we're signed out on error
      await supabase.auth.signOut();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-login-container min-h-screen flex relative">
      {/* Video Section - Full Screen Background on Mobile, Left Side on Desktop */}
      <div className="absolute inset-0 lg:relative lg:w-1/2 overflow-hidden z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-10"
          onError={(e) => {
            console.error('Video failed to load:', e);
          }}
        >
          <source src={`/Navy cut.mp4`} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        {/* Minimal overlay - no blur */}
        <div className="glass-video-overlay"></div>
      </div>

      {/* Login Form Section - Right Side on Desktop, Centered on Mobile */}
      <div className="relative z-10 w-full lg:w-1/2 flex items-center justify-center p-4 lg:p-8">
        <Card className="glass-card w-full max-w-md">
          <CardHeader className="glass-card-header text-center space-y-4">
          <div className="mx-auto">
              <div className="glass-logo-container">
            <img 
              src="https://i.postimg.cc/4NKq0Rq5/tag-logo-pdf-pdf-(1000-x-1000-px).png"
              alt="Scissors ERP" 
              className="w-45 h-36 mx-auto rounded-lg object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />
              </div>
          </div>
          <div>
              <CardTitle className="glass-title text-2xl font-bold">Scissors ERP</CardTitle>
              <CardDescription className="glass-description">Apparel Manufacturing Management</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
                <Alert variant="destructive" className="animate-fade-in glass-input border-red-400/50 bg-red-500/20">
                  <AlertDescription className="glass-text">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
                <Label htmlFor="email" className="glass-label">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@yourcompany.com"
                required
                disabled={isLoading}
                  className="glass-input"
              />
            </div>

            <div className="space-y-2">
                <Label htmlFor="password" className="glass-label">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                    className="glass-input"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-6 w-6"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                disabled={isLoading}
              />
              <Label
                htmlFor="rememberMe"
                  className="glass-label text-sm font-normal cursor-pointer"
              >
                Remember me
              </Label>
            </div>

            <Button 
              type="submit" 
                className="glass-button w-full text-white font-semibold"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
              <p className="glass-text">
              Need an account?{' '}
              <Button
                variant="link"
                  className="glass-link p-0 underline"
                onClick={() => navigate('/signup')}
              >
                Contact admin
              </Button>
            </p>
          </div>

            <div className="glass-footer mt-4 p-3">
              <p className="glass-text text-xs text-center">
              Powered by: BlackMatter Technologies
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}