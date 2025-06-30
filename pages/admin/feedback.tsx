import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';

interface FeedbackItem {
  id: string;
  name: string | null;
  email: string | null;
  category: string;
  feedback: string;
  created_at: string;
  read: boolean;
  resolved: boolean;
  admin_notes: string | null;
}

export default function FeedbackAdmin() {
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'resolved'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    checkAuth();
    fetchFeedback();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    // Check if user is admin - replace with your email
    const adminEmails = ['kyleanthony.kja@gmail.com']; // Add your email here
    const userEmail = session.user.email;
    
    if (!userEmail || !adminEmails.includes(userEmail)) {
      // User is not an admin, redirect them
      router.push('/index'); // or wherever you want to redirect non-admins
      return;
    }
  };

  const fetchFeedback = async () => {
    try {
      let query = supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter === 'unread') {
        query = query.eq('read', false);
      } else if (filter === 'resolved') {
        query = query.eq('resolved', true);
      }

      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory);
      }

      const { data, error } = await query;

      if (error) throw error;
      setFeedbackItems(data || []);
    } catch (error) {
      console.error('Error fetching feedback:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, [filter, selectedCategory]);

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('feedback')
        .update({ read: true })
        .eq('id', id);

      if (error) throw error;
      
      setFeedbackItems(items => 
        items.map(item => 
          item.id === id ? { ...item, read: true } : item
        )
      );
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const toggleResolved = async (id: string, resolved: boolean) => {
    try {
      const { error } = await supabase
        .from('feedback')
        .update({ resolved: !resolved })
        .eq('id', id);

      if (error) throw error;
      
      setFeedbackItems(items => 
        items.map(item => 
          item.id === id ? { ...item, resolved: !resolved } : item
        )
      );
    } catch (error) {
      console.error('Error updating resolved status:', error);
    }
  };

  const updateNotes = async (id: string, notes: string) => {
    try {
      const { error } = await supabase
        .from('feedback')
        .update({ admin_notes: notes })
        .eq('id', id);

      if (error) throw error;
      
      setFeedbackItems(items => 
        items.map(item => 
          item.id === id ? { ...item, admin_notes: notes } : item
        )
      );
    } catch (error) {
      console.error('Error updating notes:', error);
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'Bug': return 'bg-red-100 text-red-800';
      case 'Feature Request': return 'bg-blue-100 text-blue-800';
      case 'General Feedback': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const unreadCount = feedbackItems.filter(item => !item.read).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">Loading feedback...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              Feedback Management
              {unreadCount > 0 && (
                <span className="ml-2 bg-red-500 text-white text-sm px-2 py-1 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </h1>
            <button
              onClick={() => router.push('/roster')}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Back to App
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="border border-gray-300 rounded px-3 py-2"
            >
              <option value="all">All Feedback</option>
              <option value="unread">Unread Only</option>
              <option value="resolved">Resolved Only</option>
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2"
            >
              <option value="all">All Categories</option>
              <option value="Bug">Bugs</option>
              <option value="Feature Request">Feature Requests</option>
              <option value="General Feedback">General Feedback</option>
            </select>
          </div>

          {/* Feedback Items */}
          <div className="space-y-4">
            {feedbackItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No feedback found.
              </div>
            ) : (
              feedbackItems.map((item) => (
                <div
                  key={item.id}
                  className={`border rounded-lg p-4 ${
                    item.read ? 'bg-white' : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryBadgeColor(item.category)}`}>
                        {item.category}
                      </span>
                      {!item.read && (
                        <span className="bg-red-500 text-white text-xs px-2 py-1 rounded">
                          NEW
                        </span>
                      )}
                      {item.resolved && (
                        <span className="bg-green-500 text-white text-xs px-2 py-1 rounded">
                          RESOLVED
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString()}
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex gap-4 text-sm text-gray-600 mb-2">
                      <span><strong>Name:</strong> {item.name || 'Anonymous'}</span>
                      <span><strong>Email:</strong> {item.email || 'Not provided'}</span>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-gray-800">{item.feedback}</p>
                    </div>
                  </div>

                  {/* Admin Notes */}
                  <div className="mb-3">
                    <textarea
                      placeholder="Add admin notes..."
                      value={item.admin_notes || ''}
                      onChange={(e) => updateNotes(item.id, e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      rows={2}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {!item.read && (
                      <button
                        onClick={() => markAsRead(item.id)}
                        className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                      >
                        Mark as Read
                      </button>
                    )}
                    <button
                      onClick={() => toggleResolved(item.id, item.resolved)}
                      className={`px-3 py-1 rounded text-sm ${
                        item.resolved
                          ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`}
                    >
                      {item.resolved ? 'Mark as Unresolved' : 'Mark as Resolved'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 