import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogOverlay } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Trash2, Plus, Edit, X, Play, BookOpen, ChevronDown, ChevronRight, FileText } from 'lucide-react';
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
  parent_tutorial_id?: string | null;
  option_name?: string | null;
  written_steps?: string | null;
  is_main_tutorial?: boolean;
}

interface AdminTutorialManagerProps {
  sectionId: string;
  sectionTitle: string;
  showEditDelete?: boolean;
}

export function AdminTutorialManager({ sectionId, sectionTitle, showEditDelete = true }: AdminTutorialManagerProps) {
  const { user } = useAuth();
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMainDialogOpen, setIsMainDialogOpen] = useState(false);
  const [isOptionDialogOpen, setIsOptionDialogOpen] = useState(false);
  const [editingTutorial, setEditingTutorial] = useState<Tutorial | null>(null);
  const [selectedParentTutorial, setSelectedParentTutorial] = useState<Tutorial | null>(null);
  const [uploading, setUploading] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; title: string } | null>(null);
  const [expandedTutorials, setExpandedTutorials] = useState<Set<string>>(new Set());

  const [mainFormData, setMainFormData] = useState({
    title: '',
    description: '',
  });

  const [optionFormData, setOptionFormData] = useState({
    option_name: '',
    written_steps: '',
  });

  useEffect(() => {
    fetchTutorials();
  }, [sectionId]);

  // Listen for custom event to open dialog from TutorialsPage header button
  useEffect(() => {
    const handleOpenDialog = () => {
      console.log('Received openMainTutorialDialog event');
      setEditingTutorial(null);
      setMainFormData({ title: '', description: '' });
      setIsMainDialogOpen(true);
    };

    window.addEventListener('openMainTutorialDialog', handleOpenDialog);
    return () => {
      window.removeEventListener('openMainTutorialDialog', handleOpenDialog);
    };
  }, []);

  useEffect(() => {
    console.log('isMainDialogOpen state changed:', isMainDialogOpen);
    
    // Inject style to ensure dialog appears above TutorialsPage overlay (z-[9998])
    // Use very high z-index to ensure it's always on top
    const style = document.createElement('style');
    style.id = 'tutorial-dialog-z-index-fix';
    style.textContent = `
      [data-radix-portal] {
        z-index: 100000 !important;
      }
      [data-radix-dialog-overlay] {
        z-index: 100000 !important;
      }
      [data-radix-dialog-content] {
        z-index: 100001 !important;
        position: fixed !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      const existingStyle = document.getElementById('tutorial-dialog-z-index-fix');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

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

  const getMainTutorials = () => {
    return tutorials.filter(t => t.is_main_tutorial !== false && !t.parent_tutorial_id);
  };

  const getTutorialOptions = (parentId: string) => {
    return tutorials.filter(t => t.parent_tutorial_id === parentId);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('video/')) {
        toast.error('Please select a video file');
        return;
      }
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

  const handleMainTutorialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mainFormData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    try {
      setUploading(true);
      const maxOrder = tutorials.length > 0 
        ? Math.max(...tutorials.map(t => t.order_index)) 
        : -1;

      const { error } = await supabase
        .from('tutorials')
        .insert({
          section_id: sectionId,
          title: mainFormData.title,
          description: mainFormData.description || null,
          video_url: null, // Main tutorials don't have videos
          video_path: null,
          order_index: maxOrder + 1,
          created_by: user?.id,
          is_main_tutorial: true,
          parent_tutorial_id: null
        });

      if (error) throw error;
      toast.success('Main tutorial created successfully');
      
      setMainFormData({ title: '', description: '' });
      setIsMainDialogOpen(false);
      fetchTutorials();
    } catch (error: any) {
      console.error('Error saving tutorial:', error);
      toast.error(`Failed to save tutorial: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleOptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optionFormData.option_name.trim()) {
      toast.error('Option name is required');
      return;
    }

    if (!videoFile && !editingTutorial?.video_url) {
      toast.error('Please upload a video');
      return;
    }

    if (!selectedParentTutorial && !editingTutorial?.parent_tutorial_id) {
      toast.error('Please select a parent tutorial');
      return;
    }

    try {
      setUploading(true);
      let videoUrl = editingTutorial?.video_url || null;
      let videoPath = editingTutorial?.video_path || null;

      if (videoFile) {
        const result = await uploadVideo(videoFile);
        if (!result) {
          setUploading(false);
          return;
        }
        videoUrl = result.url;
        videoPath = result.path;
      }

      const parentId = selectedParentTutorial?.id || editingTutorial?.parent_tutorial_id;

      if (editingTutorial) {
        const { error } = await supabase
          .from('tutorials')
          .update({
            option_name: optionFormData.option_name,
            written_steps: optionFormData.written_steps || null,
            video_url: videoUrl,
            video_path: videoPath,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTutorial.id);

        if (error) throw error;
        toast.success('Option updated successfully');
      } else {
        const { error } = await supabase
          .from('tutorials')
          .insert({
            section_id: sectionId,
            title: selectedParentTutorial!.title, // Use parent title
            option_name: optionFormData.option_name,
            written_steps: optionFormData.written_steps || null,
            video_url: videoUrl,
            video_path: videoPath,
            order_index: 0,
            created_by: user?.id,
            is_main_tutorial: false,
            parent_tutorial_id: parentId
          });

        if (error) throw error;
        toast.success('Option created successfully');
      }

      setOptionFormData({ option_name: '', written_steps: '' });
      setVideoFile(null);
      setVideoPreview(null);
      setEditingTutorial(null);
      setSelectedParentTutorial(null);
      setIsOptionDialogOpen(false);
      fetchTutorials();
    } catch (error: any) {
      console.error('Error saving option:', error);
      toast.error(`Failed to save option: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleEditMainTutorial = (tutorial: Tutorial) => {
    setEditingTutorial(tutorial);
    setMainFormData({
      title: tutorial.title,
      description: tutorial.description || ''
    });
    setIsMainDialogOpen(true);
  };

  const handleEditOption = (option: Tutorial) => {
    setEditingTutorial(option);
    setOptionFormData({
      option_name: option.option_name || '',
      written_steps: option.written_steps || ''
    });
    setVideoPreview(option.video_url);
    setSelectedParentTutorial(tutorials.find(t => t.id === option.parent_tutorial_id) || null);
    setIsOptionDialogOpen(true);
  };

  const handleAddOption = (parentTutorial: Tutorial) => {
    setSelectedParentTutorial(parentTutorial);
    setEditingTutorial(null);
    setOptionFormData({ option_name: '', written_steps: '' });
    setVideoFile(null);
    setVideoPreview(null);
    setIsOptionDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this? This will also delete all options under it.')) return;

    try {
      const tutorial = tutorials.find(t => t.id === id);
      
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
      toast.success('Deleted successfully');
      fetchTutorials();
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error(`Failed to delete: ${error.message}`);
    }
  };

  const toggleExpand = (tutorialId: string) => {
    setExpandedTutorials(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tutorialId)) {
        newSet.delete(tutorialId);
      } else {
        newSet.add(tutorialId);
      }
      return newSet;
    });
  };

  const mainTutorials = getMainTutorials();

  console.log('AdminTutorialManager render - showEditDelete:', showEditDelete, 'isMainDialogOpen:', isMainDialogOpen);

  return (
    <div className="space-y-6">
      {showEditDelete && (
        <div className="flex items-center justify-end gap-2 mb-4">
          <Button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Button clicked, opening dialog. Current state:', isMainDialogOpen);
              setEditingTutorial(null);
              setMainFormData({ title: '', description: '' });
              setIsMainDialogOpen(true);
              console.log('State set to true');
            }}
            className="shadow-lg"
            type="button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Main Tutorial
          </Button>
        </div>
      )}
      
      {/* Always render Dialog, control visibility with open prop */}
      <Dialog open={isMainDialogOpen} onOpenChange={(open) => {
        console.log('Dialog onOpenChange:', open, 'showEditDelete:', showEditDelete);
        setIsMainDialogOpen(open);
        if (!open) {
          setEditingTutorial(null);
          setMainFormData({ title: '', description: '' });
        }
      }}>
        <DialogContent 
          className="max-w-2xl max-h-[90vh] overflow-y-auto" 
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
              <DialogHeader>
                <DialogTitle>
                  {editingTutorial ? 'Edit Main Tutorial' : 'Create Main Tutorial'}
                </DialogTitle>
                <DialogDescription>
                  {editingTutorial 
                    ? 'Update the main tutorial title and description. Options can be added separately.'
                    : 'Create a main tutorial that can have multiple options (e.g., Bulk Upload, Manual).'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleMainTutorialSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="main-title">Title *</Label>
                  <Input
                    id="main-title"
                    value={mainFormData.title}
                    onChange={(e) => setMainFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., How to Create a Customer"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="main-description">Description</Label>
                  <Textarea
                    id="main-description"
                    value={mainFormData.description}
                    onChange={(e) => setMainFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsMainDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={uploading}>
                    {uploading ? 'Saving...' : editingTutorial ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading tutorials...</p>
        </div>
      ) : mainTutorials.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-lg text-muted-foreground mb-4">No tutorials yet.</p>
            {showEditDelete ? (
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditingTutorial(null);
                  setMainFormData({ title: '', description: '' });
                  setIsMainDialogOpen(true);
                }}
                className="shadow-lg mt-4"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Main Tutorial
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Click "Create Main Tutorial" to get started.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {mainTutorials.map((mainTutorial) => {
            const options = getTutorialOptions(mainTutorial.id);
            const isExpanded = expandedTutorials.has(mainTutorial.id);

            return (
              <Card key={mainTutorial.id} className="border-2">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleExpand(mainTutorial.id)}
                        className="h-8 w-8"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </Button>
                      <div className="flex-1">
                        <h3 className="font-bold text-xl mb-1">{mainTutorial.title}</h3>
                        {mainTutorial.description && (
                          <p className="text-sm text-muted-foreground">{mainTutorial.description}</p>
                        )}
                        {options.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {options.length} option{options.length !== 1 ? 's' : ''} available
                          </p>
                        )}
                      </div>
                    </div>
                    {showEditDelete && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddOption(mainTutorial)}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Option
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditMainTutorial(mainTutorial)}
                          className="h-10 w-10"
                        >
                          <Edit className="w-5 h-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(mainTutorial.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-10 w-10"
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <Collapsible open={isExpanded}>
                    <CollapsibleContent>
                      <div className="mt-4 ml-12 space-y-3">
                        {options.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                            <p>No options yet. Click "Add Option" to create one.</p>
                          </div>
                        ) : (
                          options.map((option) => (
                            <Card 
                              key={option.id}
                              className={option.video_url ? "cursor-pointer hover:shadow-lg transition-all hover:scale-[1.01] border" : "border"}
                              onClick={() => {
                                if (option.video_url) {
                                  setSelectedVideo({ url: option.video_url, title: `${mainTutorial.title} - ${option.option_name}` });
                                }
                              }}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start gap-4">
                                  {option.video_url ? (
                                    <VideoThumbnail
                                      videoUrl={option.video_url}
                                      title={option.option_name || ''}
                                      className="flex-shrink-0 w-40 h-24 rounded-lg shadow-md"
                                    />
                                  ) : (
                                    <div className="flex-shrink-0 w-40 h-24 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
                                      <Play className="w-8 h-8 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-lg mb-1">{option.option_name}</h4>
                                    {option.written_steps && (
                                      <div className="mt-2 p-3 bg-muted/50 rounded-lg">
                                        <div className="flex items-center gap-2 mb-2">
                                          <FileText className="w-4 h-4 text-muted-foreground" />
                                          <span className="text-xs font-medium text-muted-foreground">Written Steps:</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground whitespace-pre-line">{option.written_steps}</p>
                                      </div>
                                    )}
                                  </div>
                                  {showEditDelete && (
                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleEditOption(option)}
                                        className="h-8 w-8"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDelete(option.id)}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Option Dialog */}
      {showEditDelete && (
        <Dialog open={isOptionDialogOpen} onOpenChange={(open) => {
          setIsOptionDialogOpen(open);
          if (!open) {
            setEditingTutorial(null);
            setSelectedParentTutorial(null);
            setOptionFormData({ option_name: '', written_steps: '' });
            setVideoFile(null);
            setVideoPreview(null);
          }
        }}>
            <DialogContent 
              className="max-w-3xl max-h-[90vh] overflow-y-auto" 
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle>
                  {editingTutorial ? 'Edit Option' : 'Add Option'}
                  {selectedParentTutorial && ` - ${selectedParentTutorial.title}`}
                </DialogTitle>
                <DialogDescription>
                  {editingTutorial
                    ? 'Update the option details, video, and written steps.'
                    : 'Add an option to this tutorial. Each option can have a video and written step-by-step instructions.'}
                </DialogDescription>
              </DialogHeader>
            <form onSubmit={handleOptionSubmit} className="space-y-4">
              <div>
                <Label htmlFor="option-name">Option Name *</Label>
                <Input
                  id="option-name"
                  value={optionFormData.option_name}
                  onChange={(e) => setOptionFormData(prev => ({ ...prev, option_name: e.target.value }))}
                  placeholder="e.g., Bulk Upload, Manual"
                  required
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
              <div>
                <Label htmlFor="written-steps">Written Steps (Optional)</Label>
                <Textarea
                  id="written-steps"
                  value={optionFormData.written_steps}
                  onChange={(e) => setOptionFormData(prev => ({ ...prev, written_steps: e.target.value }))}
                  placeholder="e.g., 1. Go to Customers page&#10;2. Click on 'Add Customer' button&#10;3. Fill in the form..."
                  rows={6}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Step-by-step instructions. Each line will be displayed as a separate step.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOptionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? 'Uploading...' : editingTutorial ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
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
