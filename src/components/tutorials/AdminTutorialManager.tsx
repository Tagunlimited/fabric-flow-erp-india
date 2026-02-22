import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Trash2, Plus, Edit, X, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/AuthProvider';
import { VideoPlayerModal } from './VideoPlayerModal';
import { VideoThumbnail } from './VideoThumbnail';

interface Tutorial {
  id: string;
  section_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  video_path: string | null;
  order_index: number;
  created_at: string;
}

interface AdminTutorialManagerProps {
  sectionId: string;
  sectionTitle: string;
}

export function AdminTutorialManager({ sectionId, sectionTitle }: AdminTutorialManagerProps) {
  const { user } = useAuth();
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTutorial, setEditingTutorial] = useState<Tutorial | null>(null);
  const [uploading, setUploading] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; title: string } | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
  });

  useEffect(() => {
    fetchTutorials();
  }, [sectionId]);

  const fetchTutorials = async () => {
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('video/')) {
        toast.error('Please select a video file');
        return;
      }
      // Validate file size (50MB limit)
      if (file.size > 50 * 1024 * 1024) {
        toast.error('Video file must be less than 50MB');
        return;
      }
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
    }
  };


  const uploadVideo = async (file: File): Promise<{ url: string; path: string } | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${sectionId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `videos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('tutorials')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('tutorials')
        .getPublicUrl(filePath);

      return { url: data.publicUrl, path: filePath };
    } catch (error: any) {
      console.error('Error uploading video:', error);
      toast.error(`Failed to upload: ${error.message}`);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!videoFile && !editingTutorial?.video_url) {
      toast.error('Please upload a video');
      return;
    }

    try {
      setUploading(true);
      let videoUrl = editingTutorial?.video_url || null;
      let videoPath = editingTutorial?.video_path || null;

      // Upload new video if provided
      if (videoFile) {
        const result = await uploadVideo(videoFile);
        if (!result) {
          setUploading(false);
          return;
        }
        videoUrl = result.url;
        videoPath = result.path;
      }

      if (editingTutorial) {
        // Update existing tutorial
        const { error } = await supabase
          .from('tutorials')
          .update({
            title: formData.title,
            description: formData.description || null,
            video_url: videoUrl,
            video_path: videoPath,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTutorial.id);

        if (error) throw error;
        toast.success('Tutorial updated successfully');
      } else {
        // Create new tutorial
        const maxOrder = tutorials.length > 0 
          ? Math.max(...tutorials.map(t => t.order_index)) 
          : -1;

        const { error } = await supabase
          .from('tutorials')
          .insert({
            section_id: sectionId,
            title: formData.title,
            description: formData.description || null,
            video_url: videoUrl,
            video_path: videoPath,
            order_index: maxOrder + 1,
            created_by: user?.id
          });

        if (error) throw error;
        toast.success('Tutorial created successfully');
      }

      // Reset form
      setFormData({ title: '', description: '' });
      setVideoFile(null);
      setVideoPreview(null);
      setEditingTutorial(null);
      setIsDialogOpen(false);
      fetchTutorials();
    } catch (error: any) {
      console.error('Error saving tutorial:', error);
      toast.error(`Failed to save tutorial: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (tutorial: Tutorial) => {
    setEditingTutorial(tutorial);
    setFormData({
      title: tutorial.title,
      description: tutorial.description || ''
    });
    setVideoPreview(tutorial.video_url);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tutorial?')) return;

    try {
      const tutorial = tutorials.find(t => t.id === id);
      
      // Delete video from storage if it exists
      if (tutorial?.video_path) {
        const { error: deleteError } = await supabase.storage
          .from('tutorials')
          .remove([tutorial.video_path]);
        
        if (deleteError) {
          console.error('Error deleting video:', deleteError);
        }
      }

      const { error } = await supabase
        .from('tutorials')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Tutorial deleted successfully');
      fetchTutorials();
    } catch (error: any) {
      console.error('Error deleting tutorial:', error);
      toast.error(`Failed to delete tutorial: ${error.message}`);
    }
  };

  const handleCancel = () => {
    setFormData({ title: '', description: '' });
    setVideoFile(null);
    setVideoPreview(null);
    setEditingTutorial(null);
    setIsDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Manage Tutorials - {sectionTitle}</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingTutorial(null);
              setFormData({ title: '', description: '' });
              setVideoFile(null);
              setVideoPreview(null);
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Tutorial
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTutorial ? 'Edit Tutorial' : 'Create New Tutorial'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., How To Create an Order"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="video">Video *</Label>
                <div className="mt-2">
                  <Input
                    id="video"
                    type="file"
                    accept="video/*"
                    onChange={handleFileSelect}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum file size: 50MB. Supported formats: MP4, WebM, OGG, QuickTime
                  </p>
                </div>
                {videoPreview && (
                  <div className="mt-4 relative">
                    <video
                      src={videoPreview}
                      controls
                      className="w-full max-h-64 rounded-lg"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        setVideoFile(null);
                        setVideoPreview(null);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? 'Uploading...' : editingTutorial ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading tutorials...</div>
      ) : tutorials.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No tutorials yet. Click "Add Tutorial" to create one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tutorials.map((tutorial) => (
            <Card 
              key={tutorial.id}
              className={tutorial.video_url ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
              onClick={() => {
                if (tutorial.video_url) {
                  setSelectedVideo({ url: tutorial.video_url, title: tutorial.title });
                }
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Thumbnail */}
                  {tutorial.video_url ? (
                    <VideoThumbnail
                      videoUrl={tutorial.video_url}
                      title={tutorial.title}
                      className="flex-shrink-0 w-32 h-20"
                    />
                  ) : (
                    <div className="flex-shrink-0 w-32 h-20 bg-muted rounded flex items-center justify-center">
                      <Play className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg mb-1">{tutorial.title}</h3>
                    {tutorial.description && (
                      <p className="text-sm text-muted-foreground">{tutorial.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(tutorial)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(tutorial.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
