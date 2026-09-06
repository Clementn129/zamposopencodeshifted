import { useState } from 'react';
import { Building2, Check, ChevronDown, Plus } from 'lucide-react';
import { useBusinessContext } from '@/hooks/BusinessContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';

const BRANCH_TYPES = [
  { value: 'retail', label: 'Retail / Shop' },
  { value: 'service', label: 'Service' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'restaurant', label: 'Restaurant' },
];

export const BranchSwitcher = () => {
  const { business, businesses, switchBranch, createBranch } = useBusinessContext();
  const [addOpen, setAddOpen] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchType, setBranchType] = useState('retail');
  const [creating, setCreating] = useState(false);

  // Show for owners (>=1 owned business). Hidden for cashiers (they own none).
  // Single-location owners still see "Add Branch" so they can start a group.
  if (!business || businesses.length === 0) return null;

  const handleSwitch = (id: string) => {
    if (id === business.id) return;
    void switchBranch(id);
  };

  const handleCreate = async () => {
    if (!branchName.trim()) {
      toast({ variant: 'destructive', title: 'Name required', description: 'Enter a name for the new branch.' });
      return;
    }
    setCreating(true);
    const id = await createBranch(branchName.trim(), branchType);
    setCreating(false);
    if (id) {
      toast({ title: 'Branch created', description: `${branchName.trim()} was created.` });
      setBranchName('');
      setBranchType('retail');
      setAddOpen(false);
      void switchBranch(id);
    } else {
      toast({ variant: 'destructive', title: 'Could not create branch', description: 'Please try again.' });
    }
  };

  const scrollable = businesses.length > 1;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 h-8">
            <Building2 className="h-3.5 w-3.5" />
            <span className="max-w-[140px] truncate">{business.name}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{businesses.length > 1 ? 'Switch branch' : 'Branches'}</DropdownMenuLabel>
          <div className={scrollable ? 'max-h-64 overflow-y-auto' : ''}>
            {businesses.map((b) => (
              <DropdownMenuItem
                key={b.id}
                onClick={() => handleSwitch(b.id)}
                className="flex items-center gap-2"
              >
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{b.name}</span>
                {b.branchKind === 'root' && (
                  <span className="text-[10px] text-muted-foreground">HQ</span>
                )}
                {b.id === business.id && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            Add Branch
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a new branch</DialogTitle>
            <DialogDescription>
              A new blank branch starts with its own empty catalog and stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branch-name">Branch name</Label>
              <Input
                id="branch-name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g. Lusaka Branch"
              />
            </div>
            <div className="space-y-2">
              <Label>Business type</Label>
              <Select value={branchType} onValueChange={setBranchType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {BRANCH_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
