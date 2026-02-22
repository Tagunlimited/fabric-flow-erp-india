import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowLeft, UserCog, Users, Palette, ShoppingBag, Scissors, Hand, CheckCircle, Truck, DollarSign, Play, X, Plus } from "lucide-react";
import StarBorder from "@/components/ui/StarBorder";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { AdminTutorialManager } from "@/components/tutorials/AdminTutorialManager";
import { VideoPlayerModal } from "@/components/tutorials/VideoPlayerModal";
import { VideoThumbnail } from "@/components/tutorials/VideoThumbnail";
import { toast } from "sonner";

type TutorialSection = 
  | 'admin' 
  | 'sales' 
  | 'printing-design' 
  | 'procurement-production' 
  | 'cutting-masters' 
  | 'picker-quality' 
  | 'dispatch'
  | 'accounts'
  | null;

interface TutorialCard {
  id: TutorialSection;
  title: string;
  icon: React.ReactNode;
  color: string; // For border animation
  bgColor: string; // For card background
  textColor: string; // For text color
}

const tutorialCards: TutorialCard[] = [
  { id: 'admin', title: 'Admin', icon: <UserCog className="w-6 h-6" />, color: '#ec4899', bgColor: '#fce7f3', textColor: '#9f1239' },
  { id: 'sales', title: 'Sales', icon: <Users className="w-6 h-6" />, color: '#6366f1', bgColor: '#e0e7ff', textColor: '#312e81' },
  { id: 'printing-design', title: 'Printing & Design', icon: <Palette className="w-6 h-6" />, color: '#f97316', bgColor: '#ffedd5', textColor: '#9a3412' },
  { id: 'procurement-production', title: 'Procurement & Production', icon: <ShoppingBag className="w-6 h-6" />, color: '#3b82f6', bgColor: '#dbeafe', textColor: '#1e3a8a' },
  { id: 'cutting-masters', title: 'Cutting Masters', icon: <Scissors className="w-6 h-6" />, color: '#ef4444', bgColor: '#fee2e2', textColor: '#991b1b' },
  { id: 'picker-quality', title: 'Picker & Quality', icon: <div className="flex items-center gap-1"><Hand className="w-5 h-5" /><CheckCircle className="w-5 h-5" /></div>, color: '#eab308', bgColor: '#fef9c3', textColor: '#854d0e' },
  { id: 'dispatch', title: 'Dispatch', icon: <Truck className="w-6 h-6" />, color: '#10b981', bgColor: '#d1fae5', textColor: '#065f46' },
  { id: 'accounts', title: 'Accounts', icon: <DollarSign className="w-6 h-6" />, color: '#8b5cf6', bgColor: '#ede9fe', textColor: '#5b21b6' },
];

const tutorialContent: Record<NonNullable<TutorialSection>, { title: string; content: string[] }> = {
  admin: {
    title: 'Admin Tutorials',
    content: []
  },
  sales: {
    title: 'Sales Tutorials',
    content: []
  },
  'printing-design': {
    title: 'Printing & Design Tutorials',
    content: []
  },
  'procurement-production': {
    title: 'Procurement & Production Tutorials',
    content: []
  },
  'cutting-masters': {
    title: 'Cutting Masters Tutorials',
    content: []
  },
  'picker-quality': {
    title: 'Picker & Quality Tutorials',
    content: []
  },
  dispatch: {
    title: 'Dispatch Tutorials',
    content: []
  },
  accounts: {
    title: 'Accounts Tutorials',
    content: []
  }
};

interface Tutorial {
  id: string;
  section_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  order_index: number;
  parent_tutorial_id?: string | null;
  option_name?: string | null;
  written_steps?: string | null;
  is_main_tutorial?: boolean;
}

export default function TutorialsPage() {
  const { user, profile } = useAuth();
  const [selectedSection, setSelectedSection] = useState<TutorialSection>(null);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loadingTutorials, setLoadingTutorials] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; title: string } | null>(null);

  // Check if user is admin
  const isPreConfiguredAdmin = user?.email === 'ecom@tagunlimitedclothing.com';
  const isAdmin = isPreConfiguredAdmin || profile?.role === 'admin';

  const handleCardClick = (sectionId: TutorialSection) => {
    setSelectedSection(sectionId);
    fetchTutorials(sectionId);
  };

  const handleBack = () => {
    setSelectedSection(null);
    setTutorials([]);
  };

  const fetchTutorials = async (sectionId: string) => {
    try {
      setLoadingTutorials(true);
      const { data, error } = await supabase
        .from('tutorials')
        .select('*')
        .eq('section_id', sectionId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setTutorials(data || []);
    } catch (error: any) {
      console.error('Error fetching tutorials:', error);
      toast.error('Failed to load tutorials');
    } finally {
      setLoadingTutorials(false);
    }
  };

  const handlePlayVideo = (videoUrl: string, title: string) => {
    setSelectedVideo({ url: videoUrl, title });
  };

  // Prevent body scroll when tutorial section is open
  useEffect(() => {
    if (selectedSection) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedSection]);

  if (selectedSection) {
    const content = tutorialContent[selectedSection];
    const card = tutorialCards.find(c => c.id === selectedSection);
    
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center">
        {/* Blurred Background Overlay */}
        <div 
          className="absolute inset-0 bg-black/40 backdrop-blur-md"
          onClick={handleBack}
        />

        {/* Centered Content Container */}
        <div className="relative z-10 w-full max-w-6xl max-h-[90vh] mx-4 bg-background rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b bg-card">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-3xl font-bold">{content.title}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  if (isAdmin) {
                    // This will be handled by AdminTutorialManager
                    const event = new CustomEvent('openMainTutorialDialog');
                    window.dispatchEvent(event);
                  } else {
                    toast.error('Only admins can create tutorials');
                  }
                }}
                className="shadow-lg"
                disabled={!isAdmin}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Main Tutorial
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="rounded-full"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <AdminTutorialManager 
              sectionId={selectedSection} 
              sectionTitle={content.title}
              showEditDelete={isAdmin}
            />
          </div>
        </div>

        {/* Video Player Modal */}
        {selectedVideo && (
          <VideoPlayerModal
            videoUrl={selectedVideo.url}
            title={selectedVideo.title}
            isOpen={!!selectedVideo}
            onClose={() => setSelectedVideo(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="w-full relative min-h-screen">
      {/* Abstract Background Pattern */}
      <div 
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)',
        }}
      >
        {/* Abstract Lines */}
        <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#d1d5db" strokeWidth="1"/>
            </pattern>
            <pattern id="dots" width="60" height="60" patternUnits="userSpaceOnUse">
              <circle cx="30" cy="30" r="2" fill="#cbd5e1" opacity="0.4"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
        
        {/* Abstract Curved Lines */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
          <svg className="absolute top-20 left-0 w-96 h-96 opacity-20" viewBox="0 0 200 200">
            <path d="M 0 100 Q 50 50 100 100 T 200 100" stroke="#9ca3af" strokeWidth="2" fill="none" />
          </svg>
          <svg className="absolute bottom-20 right-0 w-96 h-96 opacity-20" viewBox="0 0 200 200">
            <path d="M 0 100 Q 50 150 100 100 T 200 100" stroke="#9ca3af" strokeWidth="2" fill="none" />
          </svg>
          <svg className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 opacity-15" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="80" stroke="#9ca3af" strokeWidth="1.5" fill="none" strokeDasharray="5,5" />
          </svg>
        </div>
      </div>

      <div className="relative z-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="w-8 h-8" />
            Tutorials
          </h1>
          <p className="text-muted-foreground mt-2">
            Select a category to view tutorials and instructions
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {tutorialCards.map((card) => (
            <StarBorder
              key={card.id}
              as="div"
              color={card.color}
              bgColor={card.bgColor}
              textColor={card.textColor}
              speed="6s"
              thickness={2}
              onClick={() => handleCardClick(card.id)}
              className="w-full"
              style={{ width: '100%' }}
            >
              <div className="flex flex-col items-center gap-3">
                <div style={{ color: card.color }}>
                  {card.icon}
                </div>
                <h3 className="font-semibold text-lg">{card.title}</h3>
              </div>
            </StarBorder>
          ))}
        </div>
      </div>
    </div>
  );
}
