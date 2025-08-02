import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmployeeForm } from "./EmployeeForm";

interface EmployeeEditDialogProps {
  employee: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EmployeeEditDialog({ employee, isOpen, onClose, onSuccess }: EmployeeEditDialogProps) {
  const handleSuccess = () => {
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Employee - {employee?.full_name}</DialogTitle>
        </DialogHeader>
        <EmployeeForm
          initialData={employee}
          isEditing={true}
          employeeId={employee?.id}
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}