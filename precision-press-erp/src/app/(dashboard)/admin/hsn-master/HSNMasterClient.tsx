'use client';

import React, { useState, useMemo } from 'react';
import { HSNWithRate } from '@/types/hsn';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface HSNMasterClientProps {
  initialData: HSNWithRate[];
}

export default function HSNMasterClient({ initialData }: HSNMasterClientProps) {
  const [data, setData] = useState<HSNWithRate[]>(initialData);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const filteredData = useMemo(() => {
    return data.filter(hsn => {
      const matchesSearch = hsn.hsn_code.includes(search) || hsn.description.toLowerCase().includes(search.toLowerCase());
      const matchesActive = filterActive === 'ALL' || (filterActive === 'ACTIVE' ? hsn.is_active : !hsn.is_active);
      return matchesSearch && matchesActive;
    });
  }, [data, search, filterActive]);

  return (
    <div className="bg-white p-6 rounded-md shadow-sm border space-y-4">
      <div className="flex gap-4 mb-4 items-center">
        <Input 
          placeholder="Search by HSN or Description..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <select 
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as any)}
          className="border rounded px-3 py-2 text-sm bg-white"
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active Only</option>
          <option value="INACTIVE">Inactive Only</option>
        </select>
        <div className="ml-auto">
          <Button asChild>
            <a href="/admin/hsn-master/new">+ Add HSN</a>
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>HSN Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Current GST</TableHead>
              <TableHead className="text-right">Products Using</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  No HSN codes found.
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map(hsn => (
                <TableRow key={hsn.id}>
                  <TableCell className="font-medium">{hsn.hsn_code}</TableCell>
                  <TableCell className="max-w-xs truncate" title={hsn.description}>{hsn.description}</TableCell>
                  <TableCell>
                    {hsn.current_rate ? `${hsn.current_rate.gst_rate}%` : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    {hsn.products_count ? (
                      <a href={`/admin/products?hsn=${hsn.hsn_code}`} className="text-blue-600 hover:underline">
                        {hsn.products_count}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={hsn.is_active ? 'default' : 'secondary'}>
                      {hsn.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/admin/hsn-master/${hsn.id}/edit`}>Edit</a>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/admin/hsn-master/${hsn.id}/history`}>History</a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
