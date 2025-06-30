import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';


export default function Home() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/roster');
      }
    };
    checkSession();
  }, []);

  const scrollToFeatures = () => {
    const featuresSection = document.getElementById('features-section');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToWalkthrough = () => {
    // Placeholder for future walkthrough section
    const walkthroughSection = document.getElementById('walkthrough-section');
    if (walkthroughSection) {
      walkthroughSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <>
    <Head>
      <title>Smarter Shift Scheduling | RA Scheduler</title>
      <meta
      name="description"
      content="Build optimized shift schedules based on staff preferences in seconds — no spreadsheets, no stress. Ideal for RAs, student workers, and coordinators."
      />
    </Head>

    <div className="min-h-screen bg-[var(--background-white)]" style={{ fontFamily: 'Poppins, Arial, Helvetica, sans-serif' }}>
      {/* Hero Section */}
      <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 pt-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-[var(--primary-blue)] mb-6">
              Smarter Shift Scheduling in Seconds
            </h1>
            <h2 className="text-xl sm:text-2xl md:text-3xl text-[var(--primary-black)] mb-4 max-w-4xl mx-auto">
              Automatically build optimized employee schedules based on ranked preferences — no spreadsheets or headaches.
            </h2>
            <p className="text-base sm:text-lg text-gray-500 italic mb-12 max-w-2xl mx-auto">
              Perfect for RA staff scheduling, event crews, student workers, and more.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-6 mb-8">
              <Link 
                href="/login"
                className="bg-gradient-to-r from-[var(--primary-blue)] to-blue-600 text-white px-10 py-4 rounded-xl text-xl font-bold hover:from-blue-600 hover:to-blue-700 transition-all duration-300 text-center shadow-lg hover:shadow-xl transform hover:scale-105 hover:-translate-y-1"
              >
                🚀 Try It Free
              </Link>
              <button 
                onClick={scrollToWalkthrough}
                className="bg-gradient-to-r from-gray-100 to-gray-200 text-[var(--primary-blue)] px-10 py-4 rounded-xl text-xl font-bold border-2 border-[var(--primary-blue)] hover:from-[var(--primary-blue)] hover:to-blue-600 hover:text-white transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 hover:-translate-y-1"
              >
                👁️ See How It Works
              </button>
            </div>
            {/* Platform UI Showcase */}
            <div className="flex flex-col md:flex-row justify-center items-center mt-8 mb-24 space-y-4 md:space-y-0 md:space-x-4">
              <img src="/roster-ui.jpg" alt="Roster Management UI" className="w-full md:w-1/2 rounded-lg shadow-md" />
              <img src="/schedule-ui.jpg" alt="Schedule Generation UI" className="w-full md:w-1/2 rounded-lg shadow-md" />
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features-section" className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center text-[var(--primary-black)] mb-16">
            Key Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-xl shadow-sm text-center">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-semibold text-[var(--primary-black)] mb-4">Fast, Fair Scheduling</h3>
              <p className="text-gray-600 leading-relaxed">Generate optimized shift schedules in seconds, balancing staff preferences and fairness automatically.</p>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm text-center">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-xl font-semibold text-[var(--primary-black)] mb-4">Preference-Based Assignments</h3>
              <p className="text-gray-600 leading-relaxed">Use ranked availability to match employees with ideal workdays — no manual sorting or spreadsheets.</p>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm text-center">
              <div className="text-4xl mb-4">📤</div>
              <h3 className="text-xl font-semibold text-[var(--primary-black)] mb-4">Shareable & Exportable</h3>
              <p className="text-gray-600 leading-relaxed">Download polished schedules or instantly share with your team — all in one click.</p>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div id="walkthrough-section" className="bg-white py-20 px-4 sm:px-6 lg:px-8 mb-12">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center text-[var(--primary-black)] mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Step 1 */}
            <div className="text-center">
              <div className="mb-6">
                <div className="w-16 h-16 bg-[var(--primary-blue)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-white text-xl font-bold">1</span>
                </div>
                <h3 className="text-xl font-semibold text-[var(--primary-black)] mb-4">Step 1: Collect Preferences</h3>
                <p className="text-gray-600 leading-relaxed text-lg mb-6">Send a form to your team so they can rank the days they prefer to work.</p>
              </div>
              <div className="mt-6">
                <img 
                  src="/preference-collection-ui.jpg" 
                  alt="Screenshot of preference collection form" 
                  className="w-full rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300"
                />
              </div>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="mb-6">
                <div className="w-16 h-16 bg-[var(--primary-blue)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-white text-xl font-bold">2</span>
                </div>
                <h3 className="text-xl font-semibold text-[var(--primary-black)] mb-4">Step 2: Customize Schedule Rules</h3>
                <p className="text-gray-600 leading-relaxed text-lg mb-6">Set your date range, exclude days off, and choose max consecutive shifts.</p>
              </div>
              <div className="mt-6">
                <img 
                  src="/date-selection-ui.jpg" 
                  alt="Screenshot of schedule customization interface" 
                  className="w-full rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300"
                />
              </div>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="mb-6">
                <div className="w-16 h-16 bg-[var(--primary-blue)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-white text-xl font-bold">3</span>
                </div>
                <h3 className="text-xl font-semibold text-[var(--primary-black)] mb-4">Step 3: Generate & Export</h3>
                <p className="text-gray-600 leading-relaxed text-lg mb-6">Create a smart schedule in one click and export to Excel or share instantly.</p>
              </div>
              <div className="mt-6">
                <img 
                  src="/created-schedule-ui.jpg" 
                  alt="Screenshot of generated schedule and summary" 
                  className="w-full rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA Banner */}
      <div className="bg-[var(--primary-blue)] py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Start Saving Hours on Scheduling — For Free
          </h2>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            Join shift coordinators, RA teams, and student leaders already using Preference Scheduler to build better schedules.
          </p>
          <Link 
            href="/login" 
            className="bg-white text-[var(--primary-blue)] px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-50 transition-colors inline-block shadow-lg"
          >
            Try It Now
          </Link>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-[var(--primary-black)] mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Everything you need to know about getting started with smarter scheduling
            </p>
          </div>
          
          <div className="space-y-4">
            {[
              {
                question: "Is this really free to use?",
                answer: "Yes! The platform is completely free to use, with a current limit of 20 employees per schedule to keep things fast and efficient.",
                icon: "💰"
              },
              {
                question: "Do I need to create an account?",
                answer: "Yes, you'll need to sign up and verify your email to access the tool. This helps securely save your schedules, rosters, and collected preferences.",
                icon: "👤"
              },
              {
                question: "Where is my data stored? Is it secure?",
                answer: "All data is securely stored in a Supabase database and tied to your account. It's private and only accessible to you.",
                icon: "🔒"
              },
              {
                question: "What are the current limitations?",
                answer: "Right now, schedules are limited to 20 employees, and only one employee can be assigned per day. Schedule creation may take a few minutes depending on complexity, but it's still far faster than building a schedule manually.",
                icon: "⚖️"
              },
              {
                question: "How can I ask questions or request features?",
                answer: "You can use the built-in feedback form found within the app to ask questions, report issues, or request new features.",
                icon: "💬"
              }
            ].map((faq, index) => (
              <div key={index} className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 border border-gray-200">
                <button
                  onClick={() => toggleFaq(index)}
                  className={`w-full px-8 py-6 text-left flex items-center justify-between transition-all duration-300 ${
                    openFaq === index 
                      ? 'bg-gray-50' 
                      : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <div className="text-2xl">{faq.icon}</div>
                    <h3 className="text-xl font-semibold text-[var(--primary-black)]">
                      {faq.question}
                    </h3>
                  </div>
                  <div className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                      openFaq === index 
                        ? 'bg-[var(--primary-blue)] text-white rotate-180' 
                        : 'bg-gray-100 text-[var(--primary-blue)] hover:bg-gray-200'
                    }`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </button>
                <div className={`transition-all duration-400 ease-out ${
                  openFaq === index ? 'max-h-96 opacity-100 pt-4 pb-8' : 'max-h-0 opacity-0 pt-0 pb-0'
                }`}>
                  <div className="px-8">
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-6 rounded-xl border-l-4 border-[var(--primary-blue)] shadow-sm">
                      <p className="text-gray-700 leading-relaxed text-lg">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="text-center mt-12">
            <p className="text-gray-600 mb-4">Still have questions?</p>
            <Link 
              href="/login" 
              className="inline-flex items-center text-[var(--primary-blue)] font-semibold hover:underline"
            >
              Get started and explore the app
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center text-gray-600">
          <p>© 2025 Preference Scheduler. All rights reserved.</p>
        </div>
      </footer>
    </div>
    </>
  );
}

