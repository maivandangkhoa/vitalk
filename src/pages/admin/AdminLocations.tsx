import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Plus,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  Pencil,
  ExternalLink,
  X,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useAdminLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} from '@/hooks/useLocations';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';

interface LocationForm {
  name: string;
  address: string;
  googleMapsUrl: string;
  naverMapUrl: string;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_FORM: LocationForm = {
  name: '',
  address: '',
  googleMapsUrl: '',
  naverMapUrl: '',
  sortOrder: 0,
  isActive: true,
};

export default function AdminLocations() {
  const { t } = useTranslation('admin');
  const { locations, loading, refetch } = useAdminLocations();
  const [editing, setEditing] = useState<string | null>(null); // location id or 'new'
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const startAdd = () => {
    setEditing('new');
    setForm({ ...EMPTY_FORM, sortOrder: locations.length });
  };

  const startEdit = (loc: typeof locations[number]) => {
    setEditing(loc.id);
    setForm({
      name: loc.name,
      address: loc.address,
      googleMapsUrl: loc.googleMapsUrl,
      naverMapUrl: loc.naverMapUrl,
      sortOrder: loc.sortOrder,
      isActive: loc.isActive,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.address.trim()) return;
    setSaving(true);
    try {
      if (editing === 'new') {
        await createLocation(form);
      } else if (editing) {
        await updateLocation(editing, form);
      }
      toast.success(t('locations.saved'));
      setEditing(null);
      setForm(EMPTY_FORM);
      refetch();
    } catch {
      toast.error(t('locations.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await updateLocation(id, { isActive: !isActive });
      toast.success(!isActive ? t('locations.active') : t('locations.inactive'));
      refetch();
    } catch {
      toast.error(t('locations.saveFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('locations.deleteConfirm'))) return;
    try {
      await deleteLocation(id);
      toast.success(t('locations.deleted'));
      refetch();
    } catch {
      toast.error(t('locations.deleteFailed'));
    }
  };

  const inputClass =
    'h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

  return (
    <div>
      <AnimatedSection className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('locations.title')}</h1>
        <Button onClick={startAdd} disabled={editing === 'new'}>
          <Plus className="mr-2 h-4 w-4" />
          {t('locations.addLocation')}
        </Button>
      </AnimatedSection>

      {/* Add/Edit form */}
      {editing && (
        <AnimatedSection>
          <Card className="mb-6">
            <CardContent className="space-y-4 p-8">
              <h3 className="font-semibold">
                {editing === 'new' ? t('locations.addLocation') : t('locations.editLocation')}
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('locations.name')}</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputClass}
                    placeholder="Cafe ABC"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('locations.address')}</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className={inputClass}
                    placeholder="123 Gangnam-daero, Seoul"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('locations.googleMapsUrl')}</label>
                  <input
                    value={form.googleMapsUrl}
                    onChange={(e) => setForm({ ...form, googleMapsUrl: e.target.value })}
                    className={inputClass}
                    placeholder="https://maps.google.com/..."
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('locations.naverMapUrl')}</label>
                  <input
                    value={form.naverMapUrl}
                    onChange={(e) => setForm({ ...form, naverMapUrl: e.target.value })}
                    className={inputClass}
                    placeholder="https://map.naver.com/..."
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.address.trim()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  {t('locations.saved').replace('!', '')}
                </Button>
                <Button variant="outline" onClick={cancelEdit}>
                  <X className="mr-2 h-4 w-4" />
                  {t('blog.back')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </AnimatedSection>
      )}

      {/* Locations list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : locations.length > 0 ? (
        <StaggerContainer className="space-y-3">
          {locations.map((loc) => (
            <StaggerItem key={loc.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{loc.name}</span>
                      <Badge
                        className={loc.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : ''}
                        variant={loc.isActive ? 'default' : 'secondary'}
                      >
                        {loc.isActive ? t('locations.active') : t('locations.inactive')}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{loc.address}</p>
                    <div className="mt-2 flex gap-3">
                      {loc.googleMapsUrl && (
                        <a
                          href={loc.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-indigo-500 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Google Maps
                        </a>
                      )}
                      {loc.naverMapUrl && (
                        <a
                          href={loc.naverMapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Naver Map
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(loc)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleToggle(loc.id, loc.isActive)}>
                      {loc.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(loc.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-50">
              <MapPin className="h-8 w-8 text-cyan-300" />
            </div>
            <p className="text-muted-foreground">{t('locations.noLocations')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
