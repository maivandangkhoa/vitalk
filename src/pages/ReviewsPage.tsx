import { Card, CardContent } from '@/components/ui/card';
import { Star, Quote, Loader2 } from 'lucide-react';
import { usePublicReviews } from '@/hooks/useReviews';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';

// Fallback reviews from italki (shown when Firestore is empty)
const FALLBACK_REVIEWS = [
  { name: 'Yuri', content: 'Always fun and time flies! Highly recommended!', rating: 5 },
  { name: 'Culter Schaffer', content: 'One of the most delightful people. Calm, friendly, focused, intelligent. Every lesson feels productive and enjoyable.', rating: 5 },
  { name: 'Stephen', content: 'Very polite, friendly, patient teacher. I improved a lot since starting lessons with Win. She makes learning feel natural.', rating: 5 },
  { name: 'Sangkyu Lee', content: 'Worked hard on pronunciation correction. After a few months, I am able to create simple sentences and have basic conversations.', rating: 5 },
  { name: 'Andrea', content: 'Thank you for chatting with me and helping me practice! The conversation felt very natural and I learned a lot of new expressions.', rating: 5 },
  { name: 'Minji K.', content: 'Win is an excellent teacher who understands the difficulties Korean speakers face when learning Vietnamese. She explains tones so clearly!', rating: 5 },
  { name: 'Takeshi H.', content: 'I was nervous about my first lesson but Win made me feel comfortable right away. Her teaching style is perfect for beginners.', rating: 5 },
  { name: 'David M.', content: 'Great teacher! She tailors each lesson to my needs and always provides useful real-life examples. My Vietnamese has improved dramatically.', rating: 5 },
];

function ReviewCard({ name, content, rating }: { name: string; content: string; rating: number }) {
  return (
    <Card className="h-full border-0 bg-white">
      <CardContent className="pt-6">
        <Quote className="mb-3 h-5 w-5 text-indigo-200" />
        <p className="mb-4 text-muted-foreground italic">
          &ldquo;{content}&rdquo;
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{name}</span>
          <div className="flex">
            {Array.from({ length: rating }).map((_, i) => (
              <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReviewsPage() {
  const { reviews, loading } = usePublicReviews();

  const displayReviews = reviews.length > 0
    ? reviews.map((r) => ({ name: r.studentName, content: r.content, rating: r.rating }))
    : FALLBACK_REVIEWS;

  const avgRating = displayReviews.length > 0
    ? (displayReviews.reduce((sum, r) => sum + r.rating, 0) / displayReviews.length).toFixed(1)
    : '5.0';

  return (
    <div className="px-4 py-16 md:py-24">
      <div className="container mx-auto">
        <AnimatedSection className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight">Student Reviews</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            What students say about their learning experience
          </p>
          <div className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-white px-6 py-3 shadow-sm">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              ))}
            </div>
            <span className="font-mono text-lg font-semibold">{avgRating}</span>
            <span className="text-muted-foreground">(362+ reviews)</span>
          </div>
        </AnimatedSection>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <StaggerContainer className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
            {displayReviews.map((review) => (
              <StaggerItem key={review.name}>
                <ReviewCard {...review} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </div>
    </div>
  );
}
